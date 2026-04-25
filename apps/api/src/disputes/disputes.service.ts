import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  AUDIT_ACTIONS,
  canTransitionDispute,
  type AdminDisputeUpdateInput,
  type DisputeEvidence,
  type DisputeListItem,
  type DisputeListQuery,
  type DisputePartyRole,
  type DisputeStatus,
  type RaiseDisputeInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * T5.E — Disputes raised against contracts.
 *
 * Lifecycle (see `DisputeStatus`): OPEN → UNDER_REVIEW → terminal. Either
 * the contract trainer or the owning company may raise. Withdrawal is
 * limited to the raiser while the dispute is still in OPEN. Admin
 * resolution requires a non-empty `resolution` note when moving into a
 * RESOLVED_* state, and DISPUTED contract status is mirrored from this
 * service so finance dashboards can react.
 */
@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Party (raiser) actions
  // -------------------------------------------------------------------

  async raise(actorId: string, input: RaiseDisputeInput): Promise<{ id: string }> {
    const contract = await this.prisma.contract.findUnique({
      where: { id: input.contractId },
      select: {
        id: true,
        status: true,
        trainerId: true,
        company: { select: { ownerId: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    let role: DisputePartyRole;
    if (contract.trainerId === actorId) role = 'TRAINER';
    else if (contract.company.ownerId === actorId) role = 'COMPANY';
    else
      throw new ForbiddenException(
        'Only the contract trainer or the owning company may raise a dispute',
      );

    if (contract.status === 'CANCELLED') {
      throw new BadRequestException('Cannot raise a dispute on a CANCELLED contract');
    }

    const active = await this.prisma.dispute.findFirst({
      where: {
        contractId: contract.id,
        status: { in: ['OPEN', 'UNDER_REVIEW'] },
      },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException('An active dispute already exists for this contract');
    }

    let dispute: { id: string };
    try {
      dispute = await this.prisma.$transaction(async (tx) => {
        const created = await tx.dispute.create({
          data: {
            contractId: contract.id,
            raisedById: actorId,
            raisedByRole: role,
            reason: input.reason,
            description: input.description,
            evidence: (input.evidence ?? null) as Prisma.InputJsonValue,
            status: 'OPEN',
          },
          select: { id: true },
        });
        // Mirror DISPUTED on the contract so finance dashboards reflect the
        // hold. We avoid clobbering CANCELLED (already rejected above).
        if (contract.status !== 'DISPUTED') {
          await tx.contract.update({
            where: { id: contract.id },
            data: { status: 'DISPUTED' },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId,
            action: AUDIT_ACTIONS.DISPUTE_RAISED,
            entityType: 'Dispute',
            entityId: created.id,
            diff: {
              contractId: contract.id,
              reason: input.reason,
              role,
            } as Prisma.JsonObject,
          },
        });
        return created;
      });
    } catch (err) {
      // The pre-check above is best-effort. The authoritative guard is the
      // partial unique index `Dispute_contract_active_unique` (see migration
      // 20260429000000_t5e_reviews_disputes), so under concurrent raises we
      // re-translate the P2002 to the same 409 the pre-check would surface.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('An active dispute already exists for this contract');
      }
      throw err;
    }

    this.logger.log(`Dispute ${dispute.id} raised on contract ${contract.id} by ${role}`);
    return { id: dispute.id };
  }

  async withdraw(actorId: string, disputeId: string): Promise<void> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, raisedById: true, contractId: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.raisedById !== actorId) {
      throw new ForbiddenException('Only the raiser can withdraw a dispute');
    }
    if (!canTransitionDispute(dispute.status as DisputeStatus, 'WITHDRAWN')) {
      throw new BadRequestException(
        `Dispute in status ${dispute.status} cannot be withdrawn`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dispute.update({
        where: { id: dispute.id },
        data: { status: 'WITHDRAWN', resolvedAt: new Date() },
      });
      await this.maybeRestoreContractStatus(tx, dispute.contractId);
      await tx.auditLog.create({
        data: {
          actorId,
          action: AUDIT_ACTIONS.DISPUTE_WITHDRAWN,
          entityType: 'Dispute',
          entityId: dispute.id,
          diff: { from: dispute.status, to: 'WITHDRAWN' } as Prisma.JsonObject,
        },
      });
    });
  }

  // -------------------------------------------------------------------
  // Read paths
  // -------------------------------------------------------------------

  async listForActor(
    actorId: string,
    query: DisputeListQuery,
  ): Promise<{ items: DisputeListItem[]; total: number }> {
    const where: Prisma.DisputeWhereInput = {
      OR: [
        { contract: { trainerId: actorId } },
        { contract: { company: { ownerId: actorId } } },
      ],
      ...(query.status ? { status: query.status } : {}),
    };
    return this.runListQuery(where, query);
  }

  async listForAdmin(
    query: DisputeListQuery,
  ): Promise<{ items: DisputeListItem[]; total: number }> {
    const where: Prisma.DisputeWhereInput = query.status ? { status: query.status } : {};
    return this.runListQuery(where, query);
  }

  async getForActor(actorId: string, disputeId: string): Promise<DisputeListItem> {
    const row = await this.fetchOne(disputeId);
    const isParty =
      row.contract.trainerId === actorId || row.contract.company.ownerId === actorId;
    if (!isParty) throw new ForbiddenException('Not a party to this dispute');
    return this.serialize(row);
  }

  async getForAdmin(disputeId: string): Promise<DisputeListItem> {
    const row = await this.fetchOne(disputeId);
    return this.serialize(row);
  }

  // -------------------------------------------------------------------
  // Admin resolution
  // -------------------------------------------------------------------

  async adminUpdate(
    actorId: string,
    disputeId: string,
    input: AdminDisputeUpdateInput,
  ): Promise<{ id: string; status: DisputeStatus }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, contractId: true },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    const next = input.status as DisputeStatus;
    if (!canTransitionDispute(dispute.status as DisputeStatus, next)) {
      throw new BadRequestException(
        `Illegal transition ${dispute.status} → ${next}`,
      );
    }

    const isTerminal =
      next === 'RESOLVED_FOR_TRAINER' ||
      next === 'RESOLVED_FOR_COMPANY' ||
      next === 'REJECTED';

    if (isTerminal && (!input.resolution || input.resolution.trim().length < 10)) {
      throw new BadRequestException(
        'A resolution note (≥10 chars) is required to resolve or reject a dispute',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.dispute.update({
        where: { id: dispute.id },
        data: {
          status: next,
          resolverId: actorId,
          resolution: input.resolution ?? null,
          resolvedAt: isTerminal ? new Date() : null,
        },
        select: { id: true, status: true },
      });
      if (isTerminal) {
        await this.maybeRestoreContractStatus(tx, dispute.contractId);
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: isTerminal
            ? AUDIT_ACTIONS.ADMIN_DISPUTE_RESOLVED
            : AUDIT_ACTIONS.ADMIN_DISPUTE_STATUS_CHANGED,
          entityType: 'Dispute',
          entityId: dispute.id,
          diff: {
            from: dispute.status,
            to: next,
            resolution: input.resolution ?? null,
          } as Prisma.JsonObject,
        },
      });
      return updated;
    });

    return { id: result.id, status: result.status as DisputeStatus };
  }

  // -------------------------------------------------------------------
  // helpers
  // -------------------------------------------------------------------

  private async runListQuery(
    where: Prisma.DisputeWhereInput,
    query: DisputeListQuery,
  ): Promise<{ items: DisputeListItem[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: this.relationInclude,
      }),
      this.prisma.dispute.count({ where }),
    ]);
    return { items: rows.map((r) => this.serialize(r)), total };
  }

  private fetchOne(id: string) {
    return this.prisma.dispute
      .findUnique({ where: { id }, include: this.relationInclude })
      .then((row) => {
        if (!row) throw new NotFoundException('Dispute not found');
        return row;
      });
  }

  private get relationInclude() {
    return {
      contract: {
        select: {
          id: true,
          title: true,
          trainerId: true,
          trainer: { select: { name: true } },
          company: { select: { name: true, ownerId: true } },
        },
      },
      raisedBy: { select: { id: true, name: true } },
      resolver: { select: { id: true, name: true } },
    } satisfies Prisma.DisputeInclude;
  }

  private serialize(
    row: Prisma.DisputeGetPayload<{
      include: {
        contract: {
          select: {
            id: true;
            title: true;
            trainerId: true;
            trainer: { select: { name: true } };
            company: { select: { name: true; ownerId: true } };
          };
        };
        raisedBy: { select: { id: true; name: true } };
        resolver: { select: { id: true; name: true } };
      };
    }>,
  ): DisputeListItem {
    return {
      id: row.id,
      status: row.status as DisputeStatus,
      reason: row.reason as DisputeListItem['reason'],
      description: row.description ?? '',
      evidence: parseEvidence(row.evidence),
      raisedByRole: row.raisedByRole as DisputePartyRole,
      raisedAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolution: row.resolution,
      contract: {
        id: row.contract.id,
        title: row.contract.title,
        companyName: row.contract.company.name,
        trainerName: row.contract.trainer.name,
      },
      raisedBy: { id: row.raisedBy.id, displayName: row.raisedBy.name },
      resolver: row.resolver
        ? { id: row.resolver.id, displayName: row.resolver.name }
        : null,
    };
  }

  /**
   * After a dispute leaves an active state, if no other active disputes
   * remain on the contract we restore it to ACTIVE (or COMPLETED if it
   * had completedAt set). This avoids leaving the contract perpetually
   * marked DISPUTED.
   */
  private async maybeRestoreContractStatus(
    tx: Prisma.TransactionClient,
    contractId: string,
  ): Promise<void> {
    const remaining = await tx.dispute.count({
      where: { contractId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
    });
    if (remaining > 0) return;
    const contract = await tx.contract.findUnique({
      where: { id: contractId },
      select: { status: true, completedAt: true },
    });
    if (!contract) return;
    if (contract.status !== 'DISPUTED') return;
    await tx.contract.update({
      where: { id: contractId },
      data: { status: contract.completedAt ? 'COMPLETED' : 'ACTIVE' },
    });
  }
}

/**
 * Narrow the JSONB column into the public DisputeEvidence shape, dropping
 * unexpected keys defensively. Returns null when the column is empty so
 * the UI can branch cleanly.
 */
function parseEvidence(raw: Prisma.JsonValue | null): DisputeEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: DisputeEvidence = {};
  const obj = raw as Record<string, Prisma.JsonValue>;
  if (Array.isArray(obj.attachmentIds)) {
    const ids = obj.attachmentIds.filter((v): v is string => typeof v === 'string');
    if (ids.length) out.attachmentIds = ids;
  }
  if (Array.isArray(obj.links)) {
    const links = obj.links.filter((v): v is string => typeof v === 'string');
    if (links.length) out.links = links;
  }
  return out.attachmentIds || out.links ? out : null;
}
