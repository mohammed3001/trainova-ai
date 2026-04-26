import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as dns } from 'node:dns';
import type { BrandingSettingsInput } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

// Injectable type so tests can stub DNS without hitting the network.
export type TxtResolver = (hostname: string) => Promise<string[][]>;

// Public-safe shape returned to anonymous host-resolution callers. We never
// expose the verified timestamp's raw value or unrelated company columns —
// only what a public theme bootstrap needs.
export type PublicBranding = {
  companyId: string;
  companyName: string;
  companySlug: string;
  logoUrl: string | null;
  brandColorHex: string | null;
  accentColorHex: string | null;
  faviconUrl: string | null;
  footerNote: string | null;
  supportEmail: string | null;
};

const PUBLIC_BRANDING_SELECT = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  brandColorHex: true,
  accentColorHex: true,
  faviconUrl: true,
  footerNote: true,
  supportEmail: true,
} as const;

@Injectable()
export class WhiteLabelService {
  private readonly logger = new Logger(WhiteLabelService.name);
  private readonly resolveTxt: TxtResolver;

  constructor(private readonly prisma: PrismaService) {
    // Default to the platform DNS resolver. Tests can replace this with a
    // stub by overriding the property on the constructed instance.
    this.resolveTxt = (hostname) => dns.resolveTxt(hostname);
  }

  /**
   * Resolves branding for an inbound request based on the Host header. We only
   * honor the host claim if (a) the company has flipped brandingEnabled and
   * (b) DNS verification has stamped customDomainVerifiedAt. Without both
   * flags we return null so the caller falls back to platform defaults — this
   * prevents an attacker from squatting a hostname in the column to phish a
   * company's prospects.
   */
  async resolvePublicByHost(host: string | null | undefined): Promise<PublicBranding | null> {
    if (!host) return null;
    const normalized = (host.split(':')[0] ?? '').trim().toLowerCase();
    if (!normalized) return null;

    const company = await this.prisma.company.findFirst({
      where: {
        customDomain: normalized,
        brandingEnabled: true,
        customDomainVerifiedAt: { not: null },
      },
      select: PUBLIC_BRANDING_SELECT,
    });
    if (!company) return null;
    return this.toPublic(company);
  }

  async getForOwner(userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandingEnabled: true,
        brandColorHex: true,
        accentColorHex: true,
        faviconUrl: true,
        supportEmail: true,
        footerNote: true,
        customDomain: true,
        customDomainVerifiedAt: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Persists branding edits from the company OWNER. We coerce '' -> null so
   * clearing a field via the form actually nulls the column instead of storing
   * an empty string. customDomain changes always invalidate any prior
   * verification — re-verifying via DNS TXT is required before the public
   * resolver will honor the new host. brandingEnabled may only flip to true
   * when the customDomain (if set) has already been verified, otherwise we
   * silently keep it staged in the column but skip activation.
   */
  async updateForOwner(userId: string, input: BrandingSettingsInput) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true, customDomain: true, customDomainVerifiedAt: true },
    });
    if (!company) throw new NotFoundException('Company not found');

    const patch: Record<string, unknown> = {};
    const blankableUrlKeys = ['faviconUrl'] as const;
    const blankableTextKeys = [
      'brandColorHex',
      'accentColorHex',
      'supportEmail',
      'footerNote',
    ] as const;

    for (const key of blankableUrlKeys) {
      if (input[key] !== undefined) patch[key] = input[key] === '' ? null : input[key];
    }
    for (const key of blankableTextKeys) {
      if (input[key] !== undefined) patch[key] = input[key] === '' ? null : input[key];
    }

    if (input.customDomain !== undefined) {
      const next = input.customDomain === '' ? null : input.customDomain;
      patch.customDomain = next;
      // Any change to the hostname invalidates the prior verification stamp.
      // Removing the domain also clears it, so the resolver stops returning
      // the company's branding immediately.
      if (next !== company.customDomain) {
        patch.customDomainVerifiedAt = null;
      }
    }

    if (input.brandingEnabled !== undefined) {
      const desiredEnabled = input.brandingEnabled === true;
      if (!desiredEnabled) {
        patch.brandingEnabled = false;
      } else {
        // Honor the toggle only if a verified custom domain is present (or no
        // customDomain at all — which is fine for sub-path white-label that
        // does not depend on host resolution).
        const incomingDomain =
          input.customDomain === undefined ? company.customDomain : patch.customDomain;
        const verifiedNow =
          patch.customDomainVerifiedAt !== undefined
            ? patch.customDomainVerifiedAt
            : company.customDomainVerifiedAt;
        if (!incomingDomain || verifiedNow) {
          patch.brandingEnabled = true;
        } else {
          patch.brandingEnabled = false;
        }
      }
    }

    return this.prisma.company.update({
      where: { id: company.id },
      data: patch,
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        brandingEnabled: true,
        brandColorHex: true,
        accentColorHex: true,
        faviconUrl: true,
        supportEmail: true,
        footerNote: true,
        customDomain: true,
        customDomainVerifiedAt: true,
      },
    });
  }

  /**
   * Generates a deterministic DNS TXT verification token for a company's
   * pending custom domain. We hash {companyId,domain} with a server-side salt
   * so the token is stable across requests but not guessable from public
   * data. The OWNER places this in DNS as `_trainova-verify.<host>` and then
   * calls verify() to flip the verified stamp.
   */
  computeVerificationToken(companyId: string, domain: string): string {
    const salt = process.env.WHITE_LABEL_VERIFY_SALT ?? 'trainova-white-label';
    // Lazy require so we don't pay crypto load on cold paths that do not call
    // verification at all.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto') as typeof import('crypto');
    return crypto
      .createHash('sha256')
      .update(`${salt}:${companyId}:${domain}`)
      .digest('hex')
      .slice(0, 32);
  }

  async getVerificationInstructionsForOwner(userId: string) {
    const company = await this.getForOwner(userId);
    if (!company.customDomain) {
      throw new ForbiddenException('Set a custom domain before requesting verification');
    }
    const token = this.computeVerificationToken(company.id, company.customDomain);
    return {
      domain: company.customDomain,
      record: `_trainova-verify.${company.customDomain}`,
      token,
      verifiedAt: company.customDomainVerifiedAt,
    };
  }

  /**
   * Stamps customDomainVerifiedAt only after we ourselves observe the
   * expected TXT record at `_trainova-verify.<host>` via DNS. The presented
   * token must equal what the server expects to short-circuit obvious cross
   * tenant forgery, but the real proof of domain control is the DNS lookup —
   * without it, an OWNER could simply call GET /verification to obtain the
   * server-computed token and POST it straight back, claiming any hostname
   * (including a victim company's domain) without ever touching DNS.
   */
  async markVerifiedForOwner(userId: string, presentedToken: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true, customDomain: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    if (!company.customDomain) {
      throw new ForbiddenException('Set a custom domain before marking it verified');
    }
    const expected = this.computeVerificationToken(company.id, company.customDomain);
    if (presentedToken !== expected) {
      throw new ForbiddenException('Verification token does not match');
    }

    // Hard requirement: the OWNER must have placed the TXT record before this
    // call succeeds. We accept either the bare token or `trainova-verify=<token>`
    // because some DNS UIs auto-prefix the value and others do not — both are
    // unambiguous because the token is a 32-char hex hash unique to this
    // {companyId, domain} pair.
    const recordHost = `_trainova-verify.${company.customDomain}`;
    const expectedValues = new Set([expected, `trainova-verify=${expected}`]);
    let records: string[][];
    try {
      records = await this.resolveTxt(recordHost);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`DNS TXT lookup failed for ${recordHost}: ${message}`);
      throw new ForbiddenException(
        `DNS TXT record not found at ${recordHost}; add the record and try again`,
      );
    }
    const matched = records.some((chunks) => expectedValues.has(chunks.join('')));
    if (!matched) {
      throw new ForbiddenException(
        `DNS TXT record at ${recordHost} did not contain the expected verification token`,
      );
    }

    return this.prisma.company.update({
      where: { id: company.id },
      data: { customDomainVerifiedAt: new Date() },
      select: { id: true, customDomain: true, customDomainVerifiedAt: true },
    });
  }

  private toPublic(row: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColorHex: string | null;
    accentColorHex: string | null;
    faviconUrl: string | null;
    footerNote: string | null;
    supportEmail: string | null;
  }): PublicBranding {
    return {
      companyId: row.id,
      companyName: row.name,
      companySlug: row.slug,
      logoUrl: row.logoUrl,
      brandColorHex: row.brandColorHex,
      accentColorHex: row.accentColorHex,
      faviconUrl: row.faviconUrl,
      footerNote: row.footerNote,
      supportEmail: row.supportEmail,
    };
  }
}
