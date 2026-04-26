import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  type ApiTokenDto,
  type ApiTokenScope,
  type CreateApiTokenInput,
  type CreatedApiTokenDto,
  API_TOKEN_DEFAULT_RATE_LIMIT_PER_MINUTE,
  API_TOKEN_MAX_PER_COMPANY,
  API_TOKEN_PREFIX_PUBLIC,
} from '@trainova/shared';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

const tokenInclude = {
  createdBy: { select: { name: true } },
} satisfies Prisma.ApiTokenInclude;
type TokenWithCreator = Prisma.ApiTokenGetPayload<{ include: typeof tokenInclude }>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * T9.B — Public API for Enterprise.
 *
 * Issues per-company API tokens that authenticate requests against the
 * `/v1/*` controllers. Only the SHA-256 of the public + secret halves
 * lands in the DB, mirroring the email-verification / password-reset /
 * refresh-token pattern in this codebase. The raw token is shown to the
 * operator exactly once at creation.
 */
@Injectable()
export class ApiTokensService {
  private readonly logger = new Logger(ApiTokensService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Company-scoped CRUD (called by company OWNER / ADMIN over JWT)
  // ---------------------------------------------------------------------------

  async listForCompany(companyId: string): Promise<ApiTokenDto[]> {
    const rows = await this.prisma.apiToken.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: tokenInclude,
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(
    companyId: string,
    callerId: string,
    body: CreateApiTokenInput,
  ): Promise<CreatedApiTokenDto> {
    // Cap active (non-revoked) tokens to keep the audit trail bounded
    // and prevent runaway token sprawl. Admins can revoke stale ones to
    // free a slot.
    const activeCount = await this.prisma.apiToken.count({
      where: {
        companyId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (activeCount >= API_TOKEN_MAX_PER_COMPANY) {
      throw new ConflictException(
        `Active token cap reached (${API_TOKEN_MAX_PER_COMPANY}); revoke an unused token first`,
      );
    }

    // 8-char public suffix on the prefix gives the operator a way to
    // distinguish tokens at-a-glance ("tk_live_a1b2c3d4") and lets the
    // guard log a meaningful identifier for audit purposes without
    // leaking the secret half.
    const publicSuffix = randomBytes(4).toString('hex');
    const prefix = `${API_TOKEN_PREFIX_PUBLIC}${publicSuffix}`;
    const secret = randomBytes(32).toString('base64url');
    const fullToken = `${prefix}.${secret}`;
    const tokenHash = sha256(fullToken);

    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('expiresAt must be in the future');
    }

    const created = await this.prisma.apiToken.create({
      data: {
        companyId,
        createdById: callerId,
        name: body.name,
        prefix,
        tokenHash,
        scopes: body.scopes,
        rateLimitPerMinute:
          body.rateLimitPerMinute ?? API_TOKEN_DEFAULT_RATE_LIMIT_PER_MINUTE,
        expiresAt,
      },
      include: tokenInclude,
    });

    return { ...this.toDto(created), token: fullToken };
  }

  async revoke(companyId: string, callerId: string, tokenId: string): Promise<ApiTokenDto> {
    const existing = await this.prisma.apiToken.findUnique({
      where: { id: tokenId },
      include: tokenInclude,
    });
    if (!existing) throw new NotFoundException('Token not found');
    if (existing.companyId !== companyId) {
      // 404 instead of 403 so we don't leak which tokens belong to
      // other companies.
      throw new NotFoundException('Token not found');
    }
    if (existing.revokedAt) {
      throw new ConflictException('Token is already revoked');
    }
    // Atomic claim: only flip non-revoked rows. Mirrors the pattern in
    // `team.service.ts` — a concurrent revoke / expiry sweep can't race
    // and overwrite the `revokedById` of an already-revoked row.
    const claimed = await this.prisma.apiToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: callerId },
    });
    if (claimed.count === 0) {
      throw new ConflictException('Token is already revoked');
    }
    const updated = await this.prisma.apiToken.findUniqueOrThrow({
      where: { id: tokenId },
      include: tokenInclude,
    });
    return this.toDto(updated);
  }

  // ---------------------------------------------------------------------------
  // Guard-side resolution (called once per /v1/* request)
  // ---------------------------------------------------------------------------

  /**
   * Look up a token by its raw `<prefix>.<secret>` value. Returns
   * `null` for unknown / revoked / expired tokens — the guard turns
   * that into a uniform 401 so callers can't probe the difference.
   */
  async resolveToken(raw: string): Promise<{
    id: string;
    companyId: string;
    scopes: ApiTokenScope[];
    rateLimitPerMinute: number;
  } | null> {
    if (!raw.startsWith(API_TOKEN_PREFIX_PUBLIC) || !raw.includes('.')) return null;
    const tokenHash = sha256(raw);
    const row = await this.prisma.apiToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        companyId: true,
        scopes: true,
        rateLimitPerMinute: true,
        revokedAt: true,
        expiresAt: true,
      },
    });
    if (!row) return null;
    if (row.revokedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return null;
    return {
      id: row.id,
      companyId: row.companyId,
      scopes: row.scopes as ApiTokenScope[],
      rateLimitPerMinute: row.rateLimitPerMinute,
    };
  }

  /**
   * Update last-used metadata after a successful guarded call. We
   * deliberately swallow errors here so a transient DB hiccup on this
   * housekeeping update doesn't break a request the caller already
   * authenticated for.
   */
  async recordUsage(tokenId: string, ip: string | null): Promise<void> {
    try {
      await this.prisma.apiToken.update({
        where: { id: tokenId },
        data: { lastUsedAt: new Date(), lastUsedIp: ip },
      });
    } catch (err) {
      this.logger.warn(`Failed to record API token usage for ${tokenId}: ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Membership helper (mirrors `team.service.ts`)
  // ---------------------------------------------------------------------------

  /**
   * Resolve the company the caller administers. Owners are matched
   * through `Company.ownerId`; team members through `CompanyMember.role`
   * (`OWNER` or `ADMIN`). Recruiters / viewers cannot manage tokens.
   */
  async requireAdminCompany(callerId: string): Promise<{ companyId: string }> {
    const owned = await this.prisma.company.findFirst({
      where: { ownerId: callerId },
      select: { id: true },
    });
    if (owned) return { companyId: owned.id };
    const membership = await this.prisma.companyMember.findFirst({
      where: { userId: callerId, role: { in: ['OWNER', 'ADMIN'] } },
      select: { companyId: true },
    });
    if (!membership) {
      throw new ForbiddenException('You are not authorised to manage API tokens');
    }
    return { companyId: membership.companyId };
  }

  // ---------------------------------------------------------------------------
  // DTO mapper
  // ---------------------------------------------------------------------------

  private toDto(row: TokenWithCreator): ApiTokenDto {
    const now = Date.now();
    const active =
      row.revokedAt == null &&
      (row.expiresAt == null || row.expiresAt.getTime() > now);
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: row.scopes as ApiTokenScope[],
      rateLimitPerMinute: row.rateLimitPerMinute,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      lastUsedIp: row.lastUsedIp,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy?.name ?? null,
      active,
    };
  }
}
