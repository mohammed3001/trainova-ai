import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AUDIT_ACTIONS, UserStatuses, UserRoles } from '@trainova/shared';
import type { UserRole, UserStatus } from '@trainova/shared';
import { Prisma } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';

const ADMIN_ROLES: ReadonlySet<UserRole> = new Set(['SUPER_ADMIN', 'ADMIN']);

export interface AdminContext {
  actorId: string;
  actorRole: UserRole;
  ip?: string | null;
}

export interface ListUsersQuery {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  limit?: number;
  cursor?: string;
}

export interface ListCompaniesQuery {
  q?: string;
  verified?: boolean;
  limit?: number;
  cursor?: string;
}

export interface ListTrainersQuery {
  q?: string;
  verified?: boolean;
  limit?: number;
  cursor?: string;
}

function clampLimit(limit: number | undefined): number {
  const n = Number.isFinite(limit) ? Math.floor(limit as number) : 50;
  if (n < 1) return 1;
  if (n > 100) return 100;
  return n;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  // ---------------------------------------------------------------------------
  // Overview
  // ---------------------------------------------------------------------------

  async overview() {
    const [
      users,
      usersActive,
      usersSuspended,
      companies,
      companiesVerified,
      trainers,
      trainersVerified,
      requestsOpen,
      applications,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.company.count(),
      this.prisma.company.count({ where: { verified: true } }),
      this.prisma.trainerProfile.count(),
      this.prisma.trainerProfile.count({ where: { verified: true } }),
      this.prisma.jobRequest.count({ where: { status: 'OPEN' } }),
      this.prisma.application.count(),
      this.prisma.verificationRequest.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      users,
      usersActive,
      usersSuspended,
      companies,
      companiesVerified,
      trainers,
      trainersVerified,
      requestsOpen,
      applications,
      pendingVerifications,
      generatedAt: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Users — list + detail + mutations
  // ---------------------------------------------------------------------------

  async listUsers(query: ListUsersQuery) {
    const take = clampLimit(query.limit);
    const where: Prisma.UserWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { email: { contains: term, mode: 'insensitive' } },
        { name: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        locale: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        locale: true,
        emailVerifiedAt: true,
        createdAt: true,
        lastLoginAt: true,
        company: { select: { id: true, name: true, slug: true, verified: true } },
        trainerProfile: { select: { id: true, slug: true, headline: true, verified: true } },
        _count: { select: { applications: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setUserRole(ctx: AdminContext, userId: string, role: UserRole) {
    if (!UserRoles.includes(role)) throw new BadRequestException('Invalid role');
    // T7.D — only SUPER_ADMIN may grant the two top-tier admin roles.
    // The five specialized admin roles (MODERATOR / FINANCE / SUPPORT /
    // CONTENT_MANAGER / ADS_MANAGER) can be assigned by either tier so
    // an ADMIN can stand up an ops team without bothering the owner.
    if ((role === 'SUPER_ADMIN' || role === 'ADMIN') && ctx.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException(`Only SUPER_ADMIN may grant ${role}`);
    }
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === ctx.actorId) throw new BadRequestException('You cannot change your own role');
    if (target.role === 'SUPER_ADMIN' && ctx.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN may modify a SUPER_ADMIN');
    }
    // Symmetric guard: a non-SUPER_ADMIN actor must not be able to demote
    // an ADMIN either, otherwise an ADMIN could mutually demote each other
    // and lock the platform out. Only SUPER_ADMIN can change an ADMIN's role.
    if (target.role === 'ADMIN' && ctx.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN may modify an ADMIN');
    }
    if (target.role === role) return { id: target.id, role };

    // Close the TOCTOU race: the above check ran outside the transaction, so
    // a concurrent promotion of `target` to SUPER_ADMIN/ADMIN could sneak in
    // before we write. Guard the write with the DB: a non-SUPER_ADMIN actor
    // may only mutate a row whose current role is neither SUPER_ADMIN nor
    // ADMIN. If the count comes back 0 the race fired and we refuse.
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.UserWhereInput = { id: userId };
      if (ctx.actorRole !== 'SUPER_ADMIN') {
        where.role = { notIn: ['SUPER_ADMIN', 'ADMIN'] };
      }
      const result = await tx.user.updateMany({ where, data: { role } });
      if (result.count === 0) {
        throw new ForbiddenException('Only SUPER_ADMIN may modify SUPER_ADMIN/ADMIN users');
      }
      const u = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, role: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.ADMIN_USER_ROLE_CHANGED,
          entityType: 'User',
          entityId: userId,
          ip: ctx.ip ?? null,
          diff: { from: target.role, to: role },
        },
      });
      return u;
    });
  }

  async setUserStatus(ctx: AdminContext, userId: string, status: UserStatus) {
    if (!UserStatuses.includes(status)) throw new BadRequestException('Invalid status');
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.id === ctx.actorId) throw new BadRequestException('You cannot change your own status');
    if (target.role === 'SUPER_ADMIN' && ctx.actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only SUPER_ADMIN may modify a SUPER_ADMIN');
    }
    if (target.status === status) return { id: target.id, status };

    // Same TOCTOU pattern as setUserRole: the "not a SUPER_ADMIN" check
    // above ran outside the transaction, so we re-assert it atomically in
    // the write itself. A non-SUPER_ADMIN actor cannot lock a SUPER_ADMIN
    // out by racing a promotion past the earlier findUnique.
    return this.prisma.$transaction(async (tx) => {
      const where: Prisma.UserWhereInput = { id: userId };
      if (ctx.actorRole !== 'SUPER_ADMIN') {
        where.role = { not: 'SUPER_ADMIN' };
      }
      const result = await tx.user.updateMany({ where, data: { status } });
      if (result.count === 0) {
        throw new ForbiddenException('Only SUPER_ADMIN may modify a SUPER_ADMIN');
      }
      const u = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, status: true },
      });
      // Revoke refresh tokens on suspension to log the user out of all sessions.
      if (status === 'SUSPENDED') {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.ADMIN_USER_STATUS_CHANGED,
          entityType: 'User',
          entityId: userId,
          ip: ctx.ip ?? null,
          diff: { from: target.status, to: status },
        },
      });
      return u;
    });
  }

  async markEmailVerified(ctx: AdminContext, userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, emailVerifiedAt: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.emailVerifiedAt) return { id: target.id, emailVerifiedAt: target.emailVerifiedAt };

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: now },
        select: { id: true, emailVerifiedAt: true },
      });
      await tx.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: AUDIT_ACTIONS.ADMIN_USER_EMAIL_MARKED_VERIFIED,
          entityType: 'User',
          entityId: userId,
          ip: ctx.ip ?? null,
        },
      });
      return u;
    });
  }

  async resendVerificationEmail(ctx: AdminContext, userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, locale: true, emailVerifiedAt: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.emailVerifiedAt) throw new BadRequestException('Email already verified');

    await this.auth.issueVerificationEmail(target.id, target.email, target.name, target.locale);
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.actorId,
        action: AUDIT_ACTIONS.ADMIN_USER_VERIFY_RESEND,
        entityType: 'User',
        entityId: userId,
        ip: ctx.ip ?? null,
      },
    });
    return { sent: true };
  }

  async triggerPasswordReset(ctx: AdminContext, userId: string) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, locale: true, status: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (target.status !== 'ACTIVE') throw new BadRequestException('User is not active');

    // Use the internal `issuePasswordResetEmail` instead of the public
    // `forgotPassword` — the public variant swallows all errors to prevent
    // user enumeration, which would make this admin action silently succeed
    // even when the email provider fails and leave a misleading audit entry.
    await this.auth.issuePasswordResetEmail(target.id, target.locale);
    await this.prisma.auditLog.create({
      data: {
        actorId: ctx.actorId,
        action: AUDIT_ACTIONS.ADMIN_USER_PASSWORD_RESET_SENT,
        entityType: 'User',
        entityId: userId,
        ip: ctx.ip ?? null,
      },
    });
    return { sent: true };
  }

  // ---------------------------------------------------------------------------
  // Companies
  // ---------------------------------------------------------------------------

  async listCompanies(query: ListCompaniesQuery) {
    const take = clampLimit(query.limit);
    const where: Prisma.CompanyWhereInput = {};
    if (typeof query.verified === 'boolean') where.verified = query.verified;
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { country: { contains: term, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.company.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        country: true,
        websiteUrl: true,
        verified: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true } },
        _count: { select: { requests: true } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        logoUrl: true,
        country: true,
        websiteUrl: true,
        size: true,
        industry: true,
        verified: true,
        createdAt: true,
        owner: { select: { id: true, email: true, name: true, role: true, status: true } },
        _count: { select: { requests: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async setCompanyVerified(ctx: AdminContext, companyId: string, verified: boolean) {
    const target = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, verified: true },
    });
    if (!target) throw new NotFoundException('Company not found');
    if (target.verified === verified) return { id: target.id, verified };

    return this.prisma.$transaction(async (tx) => {
      const c = await tx.company.update({
        where: { id: companyId },
        data: { verified },
        select: { id: true, verified: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: verified ? AUDIT_ACTIONS.ADMIN_COMPANY_VERIFIED : AUDIT_ACTIONS.ADMIN_COMPANY_UNVERIFIED,
          entityType: 'Company',
          entityId: companyId,
          ip: ctx.ip ?? null,
        },
      });
      return c;
    });
  }

  // ---------------------------------------------------------------------------
  // Trainers
  // ---------------------------------------------------------------------------

  async listTrainers(query: ListTrainersQuery) {
    const take = clampLimit(query.limit);
    const where: Prisma.TrainerProfileWhereInput = {};
    if (typeof query.verified === 'boolean') where.verified = query.verified;
    if (query.q && query.q.trim()) {
      const term = query.q.trim();
      where.OR = [
        { slug: { contains: term, mode: 'insensitive' } },
        { headline: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.trainerProfile.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        slug: true,
        headline: true,
        country: true,
        verified: true,
        createdAt: true,
        user: {
          select: { id: true, email: true, name: true, status: true, _count: { select: { applications: true } } },
        },
        skills: { select: { skill: { select: { id: true, slug: true, nameEn: true, nameAr: true } } } },
      },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
  }

  async getTrainer(trainerId: string) {
    const trainer = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: {
        id: true,
        slug: true,
        headline: true,
        bio: true,
        country: true,
        languages: true,
        hourlyRateMin: true,
        hourlyRateMax: true,
        availability: true,
        verified: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            avatarUrl: true,
            _count: { select: { applications: true } },
          },
        },
        skills: {
          select: {
            level: true,
            yearsExperience: true,
            skill: { select: { id: true, slug: true, nameEn: true, nameAr: true } },
          },
        },
        assets: {
          where: { deletedAt: null },
          select: { id: true, title: true, url: true, kind: true },
          orderBy: { order: 'asc' },
        },
      },
    });
    if (!trainer) throw new NotFoundException('Trainer not found');
    return trainer;
  }

  async setTrainerVerified(ctx: AdminContext, trainerId: string, verified: boolean) {
    const target = await this.prisma.trainerProfile.findUnique({
      where: { id: trainerId },
      select: { id: true, verified: true },
    });
    if (!target) throw new NotFoundException('Trainer not found');
    if (target.verified === verified) return { id: target.id, verified };

    return this.prisma.$transaction(async (tx) => {
      const t = await tx.trainerProfile.update({
        where: { id: trainerId },
        data: { verified },
        select: { id: true, verified: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: ctx.actorId,
          action: verified ? AUDIT_ACTIONS.ADMIN_TRAINER_VERIFIED : AUDIT_ACTIONS.ADMIN_TRAINER_UNVERIFIED,
          entityType: 'TrainerProfile',
          entityId: trainerId,
          ip: ctx.ip ?? null,
        },
      });
      return t;
    });
  }

  // ---------------------------------------------------------------------------
  // Skill lookup (used by admin UI widgets).
  // ---------------------------------------------------------------------------

  listSkills() {
    return this.prisma.skill.findMany({ orderBy: { nameEn: 'asc' } });
  }

  // ---------------------------------------------------------------------------
  // Utility: safe actor-role check (used by ADMIN_ROLES guard callers)
  // ---------------------------------------------------------------------------

  static assertAdmin(role: UserRole): void {
    if (!ADMIN_ROLES.has(role)) throw new ForbiddenException('Admin role required');
  }
}
