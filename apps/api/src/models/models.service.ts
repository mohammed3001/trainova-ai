import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  type ModelConnectionInput,
  type ModelConnectionUpdate,
  type ModelConnectionTestResult,
  type PublicModelConnection,
  type ModelAuthKind,
} from '@trainova/shared';
import {
  decryptSecret,
  encryptSecret,
  previewSecret,
} from '../common/crypto.util';
import { PrismaService } from '../prisma/prisma.service';
import { probeModelConnection } from './model-providers';

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Caller must own the company. Throws otherwise. */
  private async ensureOwner(userId: string, companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { ownerId: true },
    });
    if (!company) throw new NotFoundException('company not found');
    if (company.ownerId !== userId) {
      throw new ForbiddenException('not your company');
    }
  }

  async list(userId: string, companyId: string): Promise<PublicModelConnection[]> {
    await this.ensureOwner(userId, companyId);
    const rows = await this.prisma.modelConnection.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toPublic(r));
  }

  async get(userId: string, id: string): Promise<PublicModelConnection> {
    const row = await this.prisma.modelConnection.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundException('connection not found');
    await this.ensureOwner(userId, row.companyId);
    return this.toPublic(row);
  }

  async create(
    userId: string,
    companyId: string,
    input: ModelConnectionInput,
  ): Promise<PublicModelConnection> {
    await this.ensureOwner(userId, companyId);
    const encrypted = input.credentials
      ? encryptSecret(input.credentials)
      : null;
    const row = await this.prisma.modelConnection.create({
      data: {
        companyId,
        name: input.name,
        provider: input.provider,
        endpointUrl: input.endpointUrl ?? null,
        modelId: input.modelId ?? null,
        region: input.region ?? null,
        authKind: input.authKind,
        encryptedCredentials: encrypted,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    return this.toPublic(row);
  }

  async update(
    userId: string,
    id: string,
    patch: ModelConnectionUpdate,
  ): Promise<PublicModelConnection> {
    const existing = await this.prisma.modelConnection.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('connection not found');
    }
    await this.ensureOwner(userId, existing.companyId);

    const data: Record<string, unknown> = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.provider !== undefined) data.provider = patch.provider;
    if (patch.endpointUrl !== undefined) data.endpointUrl = patch.endpointUrl ?? null;
    if (patch.modelId !== undefined) data.modelId = patch.modelId ?? null;
    if (patch.region !== undefined) data.region = patch.region ?? null;
    if (patch.authKind !== undefined) data.authKind = patch.authKind;
    if (patch.metadata !== undefined) {
      data.metadata = patch.metadata as Prisma.InputJsonValue;
    }
    // Empty-string credentials = "clear the stored value". Anything truthy
    // is encrypted and replaces the existing envelope.
    if (patch.credentials === '') {
      data.encryptedCredentials = null;
    } else if (typeof patch.credentials === 'string' && patch.credentials.length > 0) {
      data.encryptedCredentials = encryptSecret(patch.credentials);
    }

    // Provider invariants must be enforced against the **merged** state, not
    // the patch in isolation. Zod's superRefine on the update schema only
    // sees the patch (and `.partial()` already strips `null`), so a request
    // that switches an ANTHROPIC connection to OPENAI_COMPATIBLE without
    // also providing endpointUrl would slip through and leave the row in
    // a permanently-failing state.
    // Resolve merged credentials so the invariant check below reflects
    // what the row will actually contain after the update. Explicit
    // `null` = just-cleared, a Buffer = just-set, otherwise fall back.
    const mergedCredentials: Buffer | null =
      data.encryptedCredentials === null
        ? null
        : data.encryptedCredentials instanceof Buffer
          ? data.encryptedCredentials
          : (existing.encryptedCredentials as Buffer | null);

    const merged = {
      provider: (data.provider as string | undefined) ?? existing.provider,
      endpointUrl:
        data.endpointUrl !== undefined
          ? (data.endpointUrl as string | null)
          : existing.endpointUrl,
      region:
        data.region !== undefined
          ? (data.region as string | null)
          : existing.region,
      authKind: (data.authKind as string | undefined) ?? existing.authKind,
      credentials: mergedCredentials,
    };
    if (
      ['OPENAI_COMPATIBLE', 'RAW_HTTPS', 'HUGGINGFACE'].includes(merged.provider) &&
      !merged.endpointUrl
    ) {
      throw new BadRequestException('endpointUrl is required for this provider');
    }
    if (merged.provider === 'BEDROCK' && !merged.region) {
      throw new BadRequestException('region is required for Bedrock');
    }
    if (merged.authKind === 'aws_sigv4' && merged.provider !== 'BEDROCK') {
      throw new BadRequestException('aws_sigv4 is only valid for Bedrock');
    }
    // Any authKind other than 'none' must have credentials. Otherwise a
    // PATCH that clears credentials (`credentials: ''`) or flips
    // authKind from 'none' to a credential-requiring kind would leave
    // the row permanently 401/403 against upstream.
    if (merged.authKind !== 'none' && !merged.credentials) {
      throw new BadRequestException(
        'credentials are required when authKind is not "none"',
      );
    }

    const row = await this.prisma.modelConnection.update({ where: { id }, data });
    return this.toPublic(row);
  }

  async remove(userId: string, id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.modelConnection.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) {
      throw new NotFoundException('connection not found');
    }
    await this.ensureOwner(userId, existing.companyId);
    await this.prisma.modelConnection.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DISABLED' },
    });
    return { ok: true };
  }

  /**
   * Live-tests the connection against the upstream provider, persists
   * the result on the row, and (on success) auto-promotes a DRAFT row
   * to ACTIVE so the company can immediately attach it to a request.
   */
  async test(userId: string, id: string): Promise<ModelConnectionTestResult> {
    const row = await this.prisma.modelConnection.findUnique({ where: { id } });
    if (!row || row.deletedAt) throw new NotFoundException('connection not found');
    await this.ensureOwner(userId, row.companyId);

    const credentials = row.encryptedCredentials
      ? this.tryDecrypt(row.encryptedCredentials)
      : '';
    if (row.encryptedCredentials && !credentials) {
      throw new BadRequestException(
        'stored credentials could not be decrypted with the current APP_ENCRYPTION_KEY',
      );
    }

    const startedAt = Date.now();
    const result = await probeModelConnection(row.provider, {
      endpointUrl: row.endpointUrl,
      modelId: row.modelId,
      region: row.region,
      authKind: row.authKind as ModelAuthKind,
      credentials,
    });
    const latencyMs = Date.now() - startedAt;

    await this.prisma.modelConnection.update({
      where: { id },
      data: {
        lastCheckedAt: new Date(),
        lastCheckOk: result.ok,
        lastCheckError: result.ok ? null : result.error ?? 'probe failed',
        // Auto-promote DRAFT → ACTIVE on first successful probe so the
        // user gets an "is wired up" signal without an extra click. We
        // don't auto-demote on failure — they may have intentionally
        // rotated keys and we want their explicit decision.
        ...(result.ok && row.status === 'DRAFT' ? { status: 'ACTIVE' } : {}),
      },
    });

    return {
      ok: result.ok,
      latencyMs,
      detail: result.detail,
      error: result.error,
    };
  }

  private tryDecrypt(envelope: Buffer): string {
    try {
      return decryptSecret(envelope);
    } catch {
      return '';
    }
  }

  private toPublic(row: {
    id: string;
    companyId: string;
    name: string;
    provider: string;
    endpointUrl: string | null;
    modelId: string | null;
    region: string | null;
    authKind: string;
    encryptedCredentials: Buffer | Uint8Array | null;
    metadata: unknown;
    status: string;
    lastCheckedAt: Date | null;
    lastCheckOk: boolean | null;
    lastCheckError: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PublicModelConnection {
    let preview: string | null = null;
    if (row.encryptedCredentials) {
      try {
        const buf =
          row.encryptedCredentials instanceof Buffer
            ? row.encryptedCredentials
            : Buffer.from(row.encryptedCredentials);
        const plain = decryptSecret(buf);
        preview = previewSecret(plain);
      } catch {
        preview = '••••';
      }
    }
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      provider: row.provider as PublicModelConnection['provider'],
      endpointUrl: row.endpointUrl,
      modelId: row.modelId,
      region: row.region,
      authKind: row.authKind as PublicModelConnection['authKind'],
      hasCredentials: row.encryptedCredentials !== null,
      credentialsPreview: preview,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      status: row.status as PublicModelConnection['status'],
      lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
      lastCheckOk: row.lastCheckOk,
      lastCheckError: row.lastCheckError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
