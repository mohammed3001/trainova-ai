import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BRANDING_PRESETS,
  type ApplyBrandingPresetInput,
  type LinkAgencyInput,
  type UpdateBrandingInput,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * White-label v2 (T9.N).
 *
 * Two surfaces:
 *   - **Owner**: read/write the branding tokens for their own company,
 *     and read the consolidated child-company list when their company
 *     is a parent agency.
 *   - **Admin (CONTENT)**: link/unlink the agency hierarchy. Owner
 *     does not get to set their own parent — that's an admin action so
 *     a tenant can't fabricate a "managed by Acme" badge.
 */
@Injectable()
export class WhiteLabelService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------------
  // Owner branding
  // -------------------------------------------------------------------

  async getMyBranding(userId: string) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: {
        id: true,
        slug: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandPresetKey: true,
        logoUrl: true,
        parentAgencyId: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  /**
   * Patch the branding tokens directly. Setting a color manually
   * clears `brandPresetKey` because the colors no longer match a
   * curated preset by definition. Passing `null` clears the column;
   * omitting the key leaves it as-is (Zod's `.optional()`).
   */
  async updateMyBranding(userId: string, input: UpdateBrandingInput) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    const data: {
      brandPrimaryColor?: string | null;
      brandSecondaryColor?: string | null;
      brandPresetKey?: null;
    } = {};
    if (input.brandPrimaryColor !== undefined) {
      data.brandPrimaryColor = input.brandPrimaryColor;
    }
    if (input.brandSecondaryColor !== undefined) {
      data.brandSecondaryColor = input.brandSecondaryColor;
    }
    if (
      input.brandPrimaryColor !== undefined ||
      input.brandSecondaryColor !== undefined
    ) {
      data.brandPresetKey = null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one branding field must be provided');
    }
    return this.prisma.company.update({
      where: { id: company.id },
      data,
      select: {
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandPresetKey: true,
      },
    });
  }

  /**
   * Apply a curated preset. Atomically writes both colors *and* the
   * preset key so a subsequent GET reflects the active preset card.
   */
  async applyMyPreset(userId: string, input: ApplyBrandingPresetInput) {
    const company = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Company not found');
    const preset = BRANDING_PRESETS[input.presetKey];
    return this.prisma.company.update({
      where: { id: company.id },
      data: {
        brandPrimaryColor: preset.primary,
        brandSecondaryColor: preset.secondary,
        brandPresetKey: input.presetKey,
      },
      select: {
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandPresetKey: true,
      },
    });
  }

  /**
   * Roll-up of child companies for an agency-parent owner. Returns an
   * empty array (not 404) if the company simply has no children — the
   * UI shows "no managed companies yet" rather than an error state.
   */
  async listMyChildCompanies(userId: string) {
    const parent = await this.prisma.company.findUnique({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (!parent) throw new NotFoundException('Company not found');
    return this.prisma.company.findMany({
      where: { parentAgencyId: parent.id },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        verified: true,
        createdAt: true,
        _count: { select: { requests: true, members: true } },
      },
    });
  }

  // -------------------------------------------------------------------
  // Admin agency linking
  // -------------------------------------------------------------------

  async adminListAgencies() {
    // Any company with at least one child is an "agency parent"; we
    // also surface companies that are themselves children so the
    // operator can see both ends of the relationship in one view.
    const parents = await this.prisma.company.findMany({
      where: { childCompanies: { some: {} } },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        logoUrl: true,
        _count: { select: { childCompanies: true } },
        childCompanies: {
          orderBy: { name: 'asc' },
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            verified: true,
          },
        },
      },
    });
    return parents;
  }

  /**
   * Set or clear the parent agency for one company. We reject:
   *   - self-link (a company can't be its own parent)
   *   - linking to a parent that itself has a parent (single-level
   *     hierarchy — keeps the roll-up shallow and avoids cycles)
   *   - linking to a parent that is *currently* a child of the
   *     company being updated (would create a 2-cycle)
   */
  async adminSetParentAgency(companyId: string, input: LinkAgencyInput) {
    // Wrap the read-validate-write flow in a transaction with row locks
    // so two concurrent admins can't each pass validation and produce a
    // hierarchy cycle. Lock order is `(min(id), max(id))` so two requests
    // touching the same pair (A→B vs B→A) deadlock on the second
    // SELECT … FOR UPDATE rather than racing past each other; Postgres
    // resolves the deadlock by aborting one tx, which surfaces here as
    // a normal exception that the second admin can retry.
    return this.prisma.$transaction(async (tx) => {
      const lockIds: string[] =
        input.parentCompanyId === null || input.parentCompanyId === companyId
          ? [companyId]
          : [companyId, input.parentCompanyId].sort();
      for (const id of lockIds) {
        await tx.$executeRaw`SELECT 1 FROM "Company" WHERE id = ${id} FOR UPDATE`;
      }

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: {
          id: true,
          parentAgencyId: true,
          _count: { select: { childCompanies: true } },
        },
      });
      if (!company) throw new NotFoundException('Company not found');

      if (input.parentCompanyId === null) {
        if (company.parentAgencyId === null) {
          return { id: company.id, parentAgencyId: null };
        }
        return tx.company.update({
          where: { id: company.id },
          data: { parentAgencyId: null },
          select: { id: true, parentAgencyId: true },
        });
      }

      if (input.parentCompanyId === company.id) {
        throw new BadRequestException('A company cannot be its own parent agency');
      }

      const parent = await tx.company.findUnique({
        where: { id: input.parentCompanyId },
        select: { id: true, parentAgencyId: true },
      });
      if (!parent) throw new NotFoundException('Parent company not found');

      if (parent.parentAgencyId !== null) {
        throw new ConflictException(
          'Parent company is itself a child of another agency. Hierarchy is single-level.',
        );
      }
      if (company._count.childCompanies > 0) {
        throw new ConflictException(
          'This company has its own child companies, so it cannot become a child agency.',
        );
      }

      return tx.company.update({
        where: { id: company.id },
        data: { parentAgencyId: parent.id },
        select: { id: true, parentAgencyId: true },
      });
    });
  }

  // -------------------------------------------------------------------
  // Public host lookup (read-only, used by the company public page).
  // -------------------------------------------------------------------

  /**
   * Resolve branding for a company by its public slug. No auth — this
   * is what powers the per-company branded surface for unauthenticated
   * visitors. Only returns brand-relevant fields, never anything else
   * about the company (PII, contracts, billing).
   */
  async getPublicBrandingBySlug(slug: string) {
    const company = await this.prisma.company.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        logoUrl: true,
        brandPrimaryColor: true,
        brandSecondaryColor: true,
        brandPresetKey: true,
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  /** Used by other services to assert the actor truly owns the company. */
  ensureOwnership(actorOwnerId: string, recordOwnerId: string) {
    if (actorOwnerId !== recordOwnerId) {
      throw new ForbiddenException('Not the owner of this company');
    }
  }
}
