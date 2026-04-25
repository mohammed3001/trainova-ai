import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResolvedTax, TaxRuleInput, PublicTaxRule } from '@trainova/shared';
import { taxRuleInputSchema } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Resolves the tax treatment of a transaction by looking up the seller's
 * country in the admin-managed `TaxRule` catalog.
 *
 * Rules of engagement (matches OECD VAT/GST guidelines):
 *
 *   1. No active rule for the seller country  →  zero rate, no label.
 *   2. Buyer in a different country AND seller's rule has
 *      `exportZeroRated=true`  →  zero rate with an "Export — zero-rated"
 *      note (typical EU/GCC export treatment).
 *   3. Cross-border B2B (both parties have a verified taxId) AND seller's
 *      rule has `b2bReverseCharge=true`  →  zero rate with a
 *      reverse-charge note (buyer self-accounts in their jurisdiction).
 *   4. Otherwise  →  charge `rateBps` with the rule's `label`.
 *
 * Tax is always *inclusive* of the contract `totalAmountCents` — the
 * platform never adds a surcharge on top of the agreed price.
 */
@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(args: {
    sellerCountry: string | null | undefined;
    buyerCountry: string | null | undefined;
    sellerHasTaxId: boolean;
    buyerHasTaxId: boolean;
  }): Promise<ResolvedTax> {
    const seller = (args.sellerCountry ?? '').toUpperCase();
    if (!seller) return ZERO;

    const rule = await this.prisma.taxRule.findUnique({
      where: { countryCode: seller },
    });
    if (!rule || !rule.active) return ZERO;

    const buyer = (args.buyerCountry ?? '').toUpperCase();
    const isCrossBorder = !!buyer && buyer !== seller;

    // Cross-border B2B reverse charge — both parties hold a tax id.
    if (
      isCrossBorder &&
      rule.b2bReverseCharge &&
      args.sellerHasTaxId &&
      args.buyerHasTaxId
    ) {
      return {
        rateBps: 0,
        label: rule.label,
        reverseCharge: true,
        note: `Reverse charge — recipient to account for ${rule.label} in their jurisdiction.`,
      };
    }

    // Cross-border export to a non-domestic buyer.
    if (isCrossBorder && rule.exportZeroRated) {
      return {
        rateBps: 0,
        label: rule.label,
        reverseCharge: false,
        note: `Export — zero-rated for ${rule.label}.`,
      };
    }

    // Domestic sale (or non-zero-rated cross-border).
    if (rule.rateBps <= 0) return ZERO;
    return {
      rateBps: rule.rateBps,
      label: rule.label,
      reverseCharge: false,
      note: null,
    };
  }

  // ===================================================================
  // Admin CRUD on the catalog
  // ===================================================================

  async listRules(): Promise<PublicTaxRule[]> {
    const rows = await this.prisma.taxRule.findMany({
      orderBy: { countryCode: 'asc' },
    });
    return rows.map(toPublic);
  }

  async upsertRule(input: TaxRuleInput): Promise<PublicTaxRule> {
    const data = taxRuleInputSchema.parse(input);
    const row = await this.prisma.taxRule.upsert({
      where: { countryCode: data.countryCode },
      create: {
        countryCode: data.countryCode,
        label: data.label,
        kind: data.kind,
        rateBps: data.rateBps,
        b2bReverseCharge: data.b2bReverseCharge,
        exportZeroRated: data.exportZeroRated,
        active: data.active,
        notes: data.notes ?? null,
      },
      update: {
        label: data.label,
        kind: data.kind,
        rateBps: data.rateBps,
        b2bReverseCharge: data.b2bReverseCharge,
        exportZeroRated: data.exportZeroRated,
        active: data.active,
        notes: data.notes ?? null,
      },
    });
    return toPublic(row);
  }

  async deleteRule(countryCode: string): Promise<void> {
    const row = await this.prisma.taxRule.findUnique({
      where: { countryCode: countryCode.toUpperCase() },
    });
    if (!row) throw new NotFoundException('Tax rule not found');
    await this.prisma.taxRule.delete({ where: { id: row.id } });
  }
}

const ZERO: ResolvedTax = {
  rateBps: 0,
  label: '',
  reverseCharge: false,
  note: null,
};

function toPublic(r: {
  id: string;
  countryCode: string;
  label: string;
  kind: string;
  rateBps: number;
  b2bReverseCharge: boolean;
  exportZeroRated: boolean;
  active: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): PublicTaxRule {
  return {
    id: r.id,
    countryCode: r.countryCode,
    label: r.label,
    kind: r.kind as PublicTaxRule['kind'],
    rateBps: r.rateBps,
    b2bReverseCharge: r.b2bReverseCharge,
    exportZeroRated: r.exportZeroRated,
    active: r.active,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
