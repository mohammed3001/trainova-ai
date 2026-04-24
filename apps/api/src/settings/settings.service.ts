import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  AUDIT_ACTIONS,
  SETTING_GROUPS,
  type AdminSetting,
  type BulkSettingUpsertInput,
  type PublicSetting,
  type SettingGroup,
  type SettingUpsertInput,
  settingGroup,
  isKnownSetting,
  validateSettingValue,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

export interface SettingsActor {
  actorId: string;
  ip?: string | null;
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private toAdmin(row: {
    key: string;
    value: Prisma.JsonValue;
    group: string;
    isPublic: boolean;
    description: string | null;
    updatedAt: Date;
    updatedBy: string | null;
  }): AdminSetting {
    return {
      key: row.key,
      value: row.value,
      group: row.group,
      isPublic: row.isPublic,
      description: row.description,
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy,
    };
  }

  private toPublic(row: { key: string; value: Prisma.JsonValue; group: string }): PublicSetting {
    return { key: row.key, value: row.value, group: row.group };
  }

  async listForAdmin(group?: SettingGroup): Promise<AdminSetting[]> {
    const rows = await this.prisma.setting.findMany({
      where: group ? { group } : undefined,
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return rows.map((r) => this.toAdmin(r));
  }

  async getByKey(key: string): Promise<AdminSetting | null> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return row ? this.toAdmin(row) : null;
  }

  async listPublic(): Promise<PublicSetting[]> {
    const rows = await this.prisma.setting.findMany({
      where: { isPublic: true },
      select: { key: true, value: true, group: true },
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });
    return rows.map((r) => this.toPublic(r));
  }

  async upsert(actor: SettingsActor, input: SettingUpsertInput): Promise<AdminSetting> {
    const validation = validateSettingValue(input.key, input.value);
    if (!validation.ok) {
      throw new BadRequestException(`Invalid value for ${input.key}: ${validation.error}`);
    }
    const group: SettingGroup =
      input.group ?? (isKnownSetting(input.key) ? settingGroup(input.key) : 'general');
    if (!SETTING_GROUPS.includes(group)) {
      throw new BadRequestException(`Unknown settings group: ${group}`);
    }

    const existing = await this.prisma.setting.findUnique({ where: { key: input.key } });

    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.setting.upsert({
        where: { key: input.key },
        create: {
          key: input.key,
          value: validation.value as Prisma.InputJsonValue,
          group,
          isPublic: input.isPublic ?? false,
          description: input.description ?? null,
          updatedBy: actor.actorId,
        },
        update: {
          value: validation.value as Prisma.InputJsonValue,
          group,
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          updatedBy: actor.actorId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: AUDIT_ACTIONS.SETTING_UPDATED,
          entityType: 'Setting',
          entityId: saved.key,
          ip: actor.ip ?? null,
          diff: {
            key: saved.key,
            before: existing ? existing.value : null,
            after: saved.value,
            group: saved.group,
            isPublic: saved.isPublic,
          } as Prisma.InputJsonValue,
        },
      });
      return saved;
    });

    return this.toAdmin(row);
  }

  async upsertMany(actor: SettingsActor, input: BulkSettingUpsertInput): Promise<AdminSetting[]> {
    const results: AdminSetting[] = [];
    for (const item of input.items) {
      results.push(await this.upsert(actor, item));
    }
    return results;
  }

  async delete(actor: SettingsActor, key: string): Promise<void> {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    if (!existing) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.setting.delete({ where: { key } });
      await tx.auditLog.create({
        data: {
          actorId: actor.actorId,
          action: AUDIT_ACTIONS.SETTING_DELETED,
          entityType: 'Setting',
          entityId: key,
          ip: actor.ip ?? null,
          diff: { key, before: existing.value, after: null } as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * Fetch a single setting's value by key, returning `fallback` if missing.
   * Not authenticated — callers (services only, not controllers) are trusted.
   */
  async getValue<T = unknown>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.setting.findUnique({ where: { key }, select: { value: true } });
    if (!row) return fallback;
    return row.value as T;
  }
}
