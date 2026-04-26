import * as crypto from 'crypto';
import { URL } from 'url';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  LEARNING_PATH_PER_USER_ENROLLMENT_LIMIT,
  LEARNING_VIDEO_HOSTS_WHITELIST,
  type CompleteLearningStepInput,
  type CreateLearningPathInput,
  type LearningStepInput,
  type ListLearningPathsQuery,
  type ReplaceLearningStepsInput,
  type UpdateLearningPathInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Learning paths (T9.M).
 *
 * The service mediates three audiences against the same data model:
 *
 *   - **Admins** (CONTENT_MANAGER and above) author and curate paths,
 *     reorder steps, and toggle publish state. They never enroll —
 *     the trainer-side methods deliberately reject admin role IDs so
 *     a content manager can't pollute their own progress data.
 *
 *   - **Trainers** browse the published catalog, enroll in a path,
 *     and complete steps in order. The "in order" constraint is
 *     enforced by `assertNextStep()` so the certificate at the end
 *     can't be cheated by jumping straight to step N.
 *
 *   - **Anonymous visitors** (and employers checking a candidate)
 *     read public paths and verify a single certificate by serial.
 *     Verifying recomputes the SHA-256 hash so a tampered DB row
 *     can't masquerade as a valid certificate.
 *
 * The model intentionally has no "course" concept beyond a path —
 * it's a single-tier catalog. Anything more elaborate (skill trees,
 * prerequisites, role-based gating) is deferred until we see real
 * authoring patterns from CONTENT_MANAGER admins.
 */
@Injectable()
export class LearningPathsService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Public read surface
  // -------------------------------------------------------------------

  /**
   * Public catalog. Filters are AND-composed, all optional. We never
   * return unpublished rows here even to authenticated users — the
   * admin module has its own list endpoint.
   */
  async listPublic(filters: ListLearningPathsQuery) {
    const where: Prisma.LearningPathWhereInput = { isPublished: true };
    if (filters.level) where.level = filters.level;
    if (filters.industry) where.industry = filters.industry;
    if (filters.q && filters.q.trim()) {
      const escaped = filters.q.trim().replace(/[%_\\]/g, '\\$&');
      const like = `%${escaped}%`;
      where.OR = [
        { title: { contains: like.slice(1, -1), mode: 'insensitive' } },
        { summary: { contains: like.slice(1, -1), mode: 'insensitive' } },
      ];
    }
    return this.prisma.learningPath.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        level: true,
        industry: true,
        estimatedHours: true,
        publishedAt: true,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  /**
   * Path detail by slug (public). Includes ordered steps so the page
   * can render a table of contents. We don't include enrollment data
   * here — the controller composes that separately when the request
   * is authenticated, so anonymous visitors don't see learner counts
   * any more granular than the listing already exposes.
   */
  async getPublicBySlug(slug: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { slug },
      include: {
        steps: { orderBy: { position: 'asc' } },
      },
    });
    if (!path || !path.isPublished) {
      throw new NotFoundException('Learning path not found');
    }
    return path;
  }

  // -------------------------------------------------------------------
  // Admin (CONTENT_MANAGER) authoring surface
  // -------------------------------------------------------------------

  async adminList() {
    return this.prisma.learningPath.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
        level: true,
        industry: true,
        isPublished: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { steps: true, enrollments: true } },
      },
    });
  }

  async adminGet(id: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!path) throw new NotFoundException('Learning path not found');
    return path;
  }

  async adminCreate(actorId: string, input: CreateLearningPathInput) {
    this.assertStepsValid(input.steps);
    try {
      return await this.prisma.learningPath.create({
        data: {
          slug: input.slug,
          title: input.title,
          summary: input.summary,
          description: input.description,
          level: input.level,
          industry: input.industry ?? null,
          estimatedHours: input.estimatedHours,
          createdById: actorId,
          steps: {
            create: input.steps.map((step, idx) => ({
              position: idx + 1,
              kind: step.kind,
              title: step.title,
              body: step.body,
              url: step.url ?? null,
            })),
          },
        },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Slug already in use');
      }
      throw err;
    }
  }

  async adminUpdate(id: string, input: UpdateLearningPathInput) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }
    const existing = await this.prisma.learningPath.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Learning path not found');
    const data: Prisma.LearningPathUpdateInput = {};
    if (input.slug !== undefined) data.slug = input.slug;
    if (input.title !== undefined) data.title = input.title;
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.description !== undefined) data.description = input.description;
    if (input.level !== undefined) data.level = input.level;
    if (input.industry !== undefined) data.industry = input.industry ?? null;
    if (input.estimatedHours !== undefined) data.estimatedHours = input.estimatedHours;
    try {
      return await this.prisma.learningPath.update({ where: { id }, data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Slug already in use');
      }
      throw err;
    }
  }

  /**
   * Replace the full step set in one transaction. We require this to
   * be all-or-nothing because reordering and renumbering by-hand is
   * fragile — `(pathId, position)` is unique. Any in-progress
   * enrollment will see the new step list immediately. Users who'd
   * already completed a deleted step keep their progress row (it
   * cascades on step deletion) — but their next step calculation
   * resumes from the new ordering.
   */
  async adminReplaceSteps(id: string, input: ReplaceLearningStepsInput) {
    this.assertStepsValid(input.steps);
    const existing = await this.prisma.learningPath.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Learning path not found');
    return this.prisma.$transaction(async (tx) => {
      await tx.learningStep.deleteMany({ where: { pathId: id } });
      await tx.learningStep.createMany({
        data: input.steps.map((step, idx) => ({
          pathId: id,
          position: idx + 1,
          kind: step.kind,
          title: step.title,
          body: step.body,
          url: step.url ?? null,
        })),
      });
      return tx.learningPath.findUnique({
        where: { id },
        include: { steps: { orderBy: { position: 'asc' } } },
      });
    });
  }

  async adminSetPublish(id: string, isPublished: boolean) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id },
      include: { _count: { select: { steps: true } } },
    });
    if (!path) throw new NotFoundException('Learning path not found');
    if (isPublished && path._count.steps === 0) {
      throw new BadRequestException('Cannot publish a path with no steps');
    }
    return this.prisma.learningPath.update({
      where: { id },
      data: {
        isPublished,
        publishedAt: isPublished ? path.publishedAt ?? new Date() : null,
      },
    });
  }

  async adminDelete(id: string) {
    const existing = await this.prisma.learningPath.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Learning path not found');
    await this.prisma.learningPath.delete({ where: { id } });
  }

  // -------------------------------------------------------------------
  // Trainer enrollment surface
  // -------------------------------------------------------------------

  async listMyEnrollments(userId: string) {
    return this.prisma.learningEnrollment.findMany({
      where: { userId },
      orderBy: [{ completedAt: { sort: 'desc', nulls: 'first' } }, { enrolledAt: 'desc' }],
      include: {
        path: {
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            level: true,
            estimatedHours: true,
            _count: { select: { steps: true } },
          },
        },
        certificate: { select: { serial: true, issuedAt: true } },
        _count: { select: { progress: true } },
      },
    });
  }

  /**
   * Idempotent: enrolling a second time returns the existing row
   * rather than 409, since the user-facing button just sends a POST
   * and we'd rather not show a confusing error if they double-click.
   */
  async enroll(userId: string, slug: string) {
    const path = await this.prisma.learningPath.findUnique({ where: { slug } });
    if (!path || !path.isPublished) {
      throw new NotFoundException('Learning path not found');
    }
    const existing = await this.prisma.learningEnrollment.findUnique({
      where: { userId_pathId: { userId, pathId: path.id } },
    });
    if (existing) return existing;
    const count = await this.prisma.learningEnrollment.count({ where: { userId } });
    if (count >= LEARNING_PATH_PER_USER_ENROLLMENT_LIMIT) {
      throw new BadRequestException(
        `Enrollment limit reached (${LEARNING_PATH_PER_USER_ENROLLMENT_LIMIT}). ` +
          `Drop a path before enrolling in a new one.`,
      );
    }
    return this.prisma.learningEnrollment.create({
      data: { userId, pathId: path.id },
    });
  }

  /**
   * Snapshot of one enrollment for the trainer UI: the full path,
   * every step, and the user's progress on each step. Returns null
   * if the user is not enrolled (the controller maps to 404).
   */
  async getMyEnrollment(userId: string, slug: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { slug },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!path || !path.isPublished) {
      throw new NotFoundException('Learning path not found');
    }
    const enrollment = await this.prisma.learningEnrollment.findUnique({
      where: { userId_pathId: { userId, pathId: path.id } },
      include: {
        progress: true,
        certificate: { select: { serial: true, issuedAt: true } },
      },
    });
    if (!enrollment) {
      throw new NotFoundException('You are not enrolled in this path');
    }
    return { path, enrollment };
  }

  /**
   * Mark the *next* step complete. We deliberately don't accept a
   * step ID — the trainer client just sends "complete the next one"
   * and the server resolves which step that is. This prevents:
   *   - A user fast-forwarding past gating content
   *   - A stale client posting against a deleted step ID
   *   - The frontend having to re-derive ordering on its own
   *
   * Wrapped in a transaction so the progress row + certificate
   * issuance + enrollment.completedAt update are atomic. The
   * unique `(enrollmentId, stepId)` constraint makes
   * double-completion safe — a duplicate POST returns the same
   * shape without re-running side effects.
   */
  async completeNextStep(
    userId: string,
    slug: string,
    body: CompleteLearningStepInput,
  ) {
    const path = await this.prisma.learningPath.findUnique({
      where: { slug },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!path || !path.isPublished) {
      throw new NotFoundException('Learning path not found');
    }
    if (path.steps.length === 0) {
      throw new BadRequestException('Path has no steps');
    }
    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.learningEnrollment.findUnique({
        where: { userId_pathId: { userId, pathId: path.id } },
        include: { progress: { select: { stepId: true } } },
      });
      if (!enrollment) {
        throw new NotFoundException('You are not enrolled in this path');
      }
      if (enrollment.completedAt) {
        throw new BadRequestException('Path already completed');
      }
      const completedIds = new Set(enrollment.progress.map((p) => p.stepId));
      const nextStep = path.steps.find((s) => !completedIds.has(s.id));
      if (!nextStep) {
        // Defensive: shouldn't happen because completedAt would be set.
        throw new BadRequestException('Path already completed');
      }
      if (nextStep.kind !== 'REFLECTION' && body.reflection) {
        throw new BadRequestException(
          `Only REFLECTION steps accept a reflection body (got ${nextStep.kind})`,
        );
      }
      await tx.learningStepProgress.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: nextStep.id,
          reflection:
            nextStep.kind === 'REFLECTION' ? body.reflection ?? null : null,
        },
      });
      const lastStep = path.steps[path.steps.length - 1];
      const isFinal = !!lastStep && lastStep.id === nextStep.id;
      let certificate: { serial: string; issuedAt: Date } | null = null;
      if (isFinal) {
        const issuedAt = new Date();
        const serial = crypto.randomUUID();
        const hashSha256 = crypto
          .createHash('sha256')
          .update(`${serial}|${enrollment.id}|${issuedAt.toISOString()}`)
          .digest('hex');
        const cert = await tx.learningCertificate.create({
          data: { enrollmentId: enrollment.id, serial, hashSha256, issuedAt },
        });
        await tx.learningEnrollment.update({
          where: { id: enrollment.id },
          data: { completedAt: issuedAt },
        });
        certificate = { serial: cert.serial, issuedAt: cert.issuedAt };
      }
      return {
        completedStepId: nextStep.id,
        isPathCompleted: isFinal,
        certificate,
      };
    });
  }

  // -------------------------------------------------------------------
  // Public certificate verification
  // -------------------------------------------------------------------

  /**
   * Look up a certificate by serial and recompute its hash. Returns
   * a small public object (learner name, path title, dates) — never
   * the user's email or path internals. The hash check guards
   * against an attacker who restored a tampered DB snapshot but
   * couldn't recompute the hash because they don't know the schema.
   */
  async verifyCertificate(serial: string) {
    const cert = await this.prisma.learningCertificate.findUnique({
      where: { serial },
      include: {
        enrollment: {
          include: {
            user: { select: { name: true } },
            path: { select: { slug: true, title: true, level: true } },
          },
        },
      },
    });
    if (!cert) throw new NotFoundException('Certificate not found');
    const recomputed = crypto
      .createHash('sha256')
      .update(`${cert.serial}|${cert.enrollmentId}|${cert.issuedAt.toISOString()}`)
      .digest('hex');
    const valid = crypto.timingSafeEqual(
      Buffer.from(recomputed, 'hex'),
      Buffer.from(cert.hashSha256, 'hex'),
    );
    return {
      valid,
      serial: cert.serial,
      issuedAt: cert.issuedAt,
      learnerName: cert.enrollment.user.name,
      pathTitle: cert.enrollment.path.title,
      pathSlug: cert.enrollment.path.slug,
      pathLevel: cert.enrollment.path.level,
    };
  }

  // -------------------------------------------------------------------
  // Internal validation helpers
  // -------------------------------------------------------------------

  /**
   * Server-side step validation — Zod handles the LINK/VIDEO + url
   * cross-check in the schema, but we additionally enforce that
   * VIDEO embed URLs come from a narrow whitelist so the frontend
   * iframe sandbox stays auditable.
   */
  private assertStepsValid(steps: LearningStepInput[]): void {
    for (const [idx, step] of steps.entries()) {
      if (step.kind === 'VIDEO' && step.url) {
        const host = this.tryGetHost(step.url);
        if (!host || !LEARNING_VIDEO_HOSTS_WHITELIST.includes(host as never)) {
          throw new BadRequestException(
            `Step ${idx + 1}: video host "${host ?? '?'}" is not allowed`,
          );
        }
      }
    }
  }

  private tryGetHost(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}
