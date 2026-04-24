import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@trainova/db';
import {
  AUDIT_ACTIONS,
  flagPayloadSchema,
  flagUpsertInput,
  type FlagContext,
  type FlagEvaluation,
  type FlagPayload,
  type FlagUpsertInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface FeatureFlagActor {
  actorId: string;
  ip?: string | null;
}

export interface AdminFeatureFlag {
  key: string;
  description: string | null;
  enabled: boolean;
  payload: FlagPayload | null;
  updatedAt: string;
  updatedBy: string | null;
}

const BUCKET_MAX = 100_000;

function hashBucket(key: string, subjectId: string): number {
  const h = createHash('sha256').update(`ff:${key}:${subjectId}`).digest();
  const n = h.readUInt32BE(0);
  return n % BUCKET_MAX;
}

function pickVariant(key: string, subjectId: string, variants: { key: string; weight: number }[]): string | null {
  if (!variants.length) return null;
  const bucket = hashBucket(`${key}:variant`, subjectId) / BUCKET_MAX;
  let acc = 0;
  const total = variants.reduce((s, v) => s + v.weight, 0);
  if (total <= 0) return null;
  for (const v of variants) {
    acc += v.weight / total;
    if (bucket <= acc) return v.key;
  }
  const last = variants[variants.length - 1];
  return last ? last.key : null;
}

function audienceMatches(
  audiences: NonNullable<FlagPayload['audiences']>,
  ctx: FlagContext,
): boolean {
  if (!audiences.length) return false;
  // OR across audiences; AND within each audience entry.
  return audiences.some((a) => {
    if (a.roles && a.roles.length) {
      if (!ctx.role || !a.roles.includes(ctx.role)) return false;
    }
    if (a.userIds && a.userIds.length) {
      if (!ctx.userId || !a.userIds.includes(ctx.userId)) return false;
    }
    if (a.emails && a.emails.length) {
      if (!ctx.email || !a.emails.includes(ctx.email.toLowerCase())) return false;
    }
    if (a.countries && a.countries.length) {
      if (!ctx.country || !a.countries.includes(ctx.country.toUpperCase())) return false;
    }
    if (a.locales && a.locales.length) {
      if (!ctx.locale || !a.locales.includes(ctx.locale)) return false;
    }
    return true;
  });
}

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  private toAdmin(row: {
    key: string;
    description: string | null;
    enabled: boolean;
    payload: Prisma.JsonValue | null;
    updatedAt: Date;
    updatedBy: string | null;
  }): AdminFeatureFlag {
    const parsed = row.payload ? flagPayloadSchema.safeParse(row.payload) : null;
    return {
      key: row.key,
      description: row.description,
      enabled: row.enabled,
      payload: parsed && parsed.success ? parsed.data : null,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  async listForAdmin(): Promise<AdminFeatureFlag[]> {
    const rows = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return rows.map((r) => this.toAdmin(r));
  }

  async getForAdmin(key: string): Promise<AdminFeatureFlag> {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!row) throw new NotFoundException('feature flag not found');
    return this.toAdmin(row);
  }

  async upsert(actor: FeatureFlagActor, input: FlagUpsertInput): Promise<AdminFeatureFlag> {
    // Already validated by ZodValidationPipe at controller; re-parse defensively.
    const parsed = flagUpsertInput.parse(input);
    const existing = await this.prisma.featureFlag.findUnique({ where: { key: parsed.key } });

    const payloadValue: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined =
      parsed.payload === null
        ? Prisma.JsonNull
        : parsed.payload === undefined
          ? undefined
          : (parsed.payload as unknown as Prisma.InputJsonValue);

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.featureFlag.upsert({
        where: { key: parsed.key },
        create: {
          key: parsed.key,
          description: parsed.description ?? null,
          enabled: parsed.enabled,
          payload: payloadValue ?? Prisma.JsonNull,
          updatedBy: actor.actorId,
        },
        update: {
          ...(parsed.description !== undefined ? { description: parsed.description ?? null } : {}),
          enabled: parsed.enabled,
          ...(payloadValue !== undefined ? { payload: payloadValue } : {}),
          updatedBy: actor.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: existing ? AUDIT_ACTIONS.FEATURE_FLAG_UPDATED : AUDIT_ACTIONS.FEATURE_FLAG_CREATED,
          entityType: 'FeatureFlag',
          entityId: saved.key,
          ip: actor.ip ?? null,
          diff: {
            before: existing ? { enabled: existing.enabled, payload: existing.payload } : null,
            after: { enabled: saved.enabled, payload: saved.payload },
          } as Prisma.InputJsonValue,
        },
      });
      return saved;
    });

    return this.toAdmin(row);
  }

  async delete(actor: FeatureFlagActor, key: string): Promise<void> {
    const existing = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!existing) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.featureFlag.delete({ where: { key } });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: AUDIT_ACTIONS.FEATURE_FLAG_DELETED,
          entityType: 'FeatureFlag',
          entityId: key,
          ip: actor.ip ?? null,
          diff: { before: { enabled: existing.enabled, payload: existing.payload }, after: null } as Prisma.InputJsonValue,
        },
      });
    });
  }

  async evaluate(key: string, ctx: FlagContext): Promise<FlagEvaluation> {
    const row = await this.prisma.featureFlag.findUnique({ where: { key } });
    if (!row) return { key, enabled: false, variant: null, reason: 'no-such-flag', payload: null };
    if (!row.enabled) return { key, enabled: false, variant: null, reason: 'disabled', payload: null };

    const parsed = row.payload ? flagPayloadSchema.safeParse(row.payload) : null;
    const payload: FlagPayload = parsed && parsed.success ? parsed.data : {};

    const subject = ctx.userId || ctx.email?.toLowerCase() || 'anonymous';

    if (payload.audiences && payload.audiences.length) {
      const match = audienceMatches(payload.audiences, ctx);
      if (!match) return { key, enabled: false, variant: null, reason: 'audience-mismatch', payload: null };
      const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
      const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
      return { key, enabled: true, variant, reason: 'audience-match', payload: variantPayload };
    }

    if (typeof payload.rolloutPercent === 'number' && payload.rolloutPercent < 100) {
      const bucket = hashBucket(key, subject) / BUCKET_MAX;
      if (bucket >= payload.rolloutPercent / 100) {
        return { key, enabled: false, variant: null, reason: 'rollout-excluded', payload: null };
      }
      const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
      const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
      return { key, enabled: true, variant, reason: 'rollout-included', payload: variantPayload };
    }

    const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
    const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
    return { key, enabled: true, variant, reason: 'rollout-included', payload: variantPayload };
  }

  async evaluateMany(keys: string[], ctx: FlagContext): Promise<Record<string, FlagEvaluation>> {
    if (!keys.length) return {};
    if (keys.length > 100) throw new BadRequestException('too many keys (max 100)');
    const results: Record<string, FlagEvaluation> = {};
    // Batch read then in-memory evaluate to avoid N queries.
    const rows = await this.prisma.featureFlag.findMany({ where: { key: { in: keys } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    for (const key of keys) {
      const row = byKey.get(key);
      if (!row) {
        results[key] = { key, enabled: false, variant: null, reason: 'no-such-flag', payload: null };
        continue;
      }
      if (!row.enabled) {
        results[key] = { key, enabled: false, variant: null, reason: 'disabled', payload: null };
        continue;
      }
      const parsed = row.payload ? flagPayloadSchema.safeParse(row.payload) : null;
      const payload: FlagPayload = parsed && parsed.success ? parsed.data : {};
      const subject = ctx.userId || ctx.email?.toLowerCase() || 'anonymous';

      if (payload.audiences && payload.audiences.length) {
        const match = audienceMatches(payload.audiences, ctx);
        if (!match) {
          results[key] = { key, enabled: false, variant: null, reason: 'audience-mismatch', payload: null };
          continue;
        }
        const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
        const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
        results[key] = { key, enabled: true, variant, reason: 'audience-match', payload: variantPayload };
        continue;
      }
      if (typeof payload.rolloutPercent === 'number' && payload.rolloutPercent < 100) {
        const bucket = hashBucket(key, subject) / BUCKET_MAX;
        if (bucket >= payload.rolloutPercent / 100) {
          results[key] = { key, enabled: false, variant: null, reason: 'rollout-excluded', payload: null };
          continue;
        }
        const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
        const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
        results[key] = { key, enabled: true, variant, reason: 'rollout-included', payload: variantPayload };
        continue;
      }
      const variant = payload.variants ? pickVariant(key, subject, payload.variants) : null;
      const variantPayload = variant && payload.variants ? payload.variants.find((v) => v.key === variant)?.payload ?? null : null;
      results[key] = { key, enabled: true, variant, reason: 'rollout-included', payload: variantPayload };
    }
    return results;
  }

  /** Convenience: true/false only (for server-side gating). */
  async isEnabled(key: string, ctx: FlagContext): Promise<boolean> {
    const r = await this.evaluate(key, ctx);
    return r.enabled;
  }
}
