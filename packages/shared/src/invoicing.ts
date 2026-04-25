import { z } from 'zod';

// ===========================================================================
// Tax catalog (admin) + tax profile (per-user) + invoice public types
// ===========================================================================

export const TaxKinds = ['VAT', 'GST', 'SALES_TAX', 'ZAKAT', 'OTHER'] as const;
export type TaxKind = (typeof TaxKinds)[number];

export const TaxEntityKinds = ['INDIVIDUAL', 'BUSINESS'] as const;
export type TaxEntityKind = (typeof TaxEntityKinds)[number];

export const InvoiceKinds = ['PURCHASE', 'PAYOUT_STATEMENT'] as const;
export type InvoiceKind = (typeof InvoiceKinds)[number];

export const InvoiceStatuses = ['ISSUED', 'PAID', 'VOID'] as const;
export type InvoiceStatus = (typeof InvoiceStatuses)[number];

// ---------------------------------------------------------------------------
// TaxRule — admin catalog
// ---------------------------------------------------------------------------

const countryCodeRegex = /^[A-Z]{2}$/;

export const taxRuleInputSchema = z.object({
  countryCode: z.string().regex(countryCodeRegex, 'ISO-3166-1 alpha-2 expected'),
  label: z.string().min(1).max(40),
  kind: z.enum(TaxKinds),
  rateBps: z.number().int().min(0).max(10_000),
  b2bReverseCharge: z.boolean().default(false),
  exportZeroRated: z.boolean().default(true),
  active: z.boolean().default(true),
  notes: z.string().max(500).nullish(),
});
export type TaxRuleInput = z.infer<typeof taxRuleInputSchema>;

export interface PublicTaxRule {
  id: string;
  countryCode: string;
  label: string;
  kind: TaxKind;
  rateBps: number;
  b2bReverseCharge: boolean;
  exportZeroRated: boolean;
  active: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// TaxProfile — per-user
// ---------------------------------------------------------------------------

export const taxProfileInputSchema = z.object({
  countryCode: z.string().regex(countryCodeRegex),
  kind: z.enum(TaxEntityKinds).default('INDIVIDUAL'),
  legalName: z.string().max(200).nullish(),
  taxId: z.string().max(64).nullish(),
  addressLine1: z.string().max(200).nullish(),
  addressLine2: z.string().max(200).nullish(),
  city: z.string().max(120).nullish(),
  region: z.string().max(120).nullish(),
  postalCode: z.string().max(40).nullish(),
});
export type TaxProfileInput = z.infer<typeof taxProfileInputSchema>;

export interface PublicTaxProfile {
  countryCode: string;
  kind: TaxEntityKind;
  legalName: string | null;
  taxId: string | null;
  taxIdVerified: boolean;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
}

// ---------------------------------------------------------------------------
// Tax resolution
// ---------------------------------------------------------------------------

/**
 * Outcome of resolving the tax rate for a transaction. The platform is
 * the seller of record for buyer-paid milestones (PURCHASE invoices)
 * and the trainer is the seller of record for self-billing payout
 * statements; `resolveTax` is shaped for the buyer-side direction —
 * call sites flip the parties for payout statements.
 */
export interface ResolvedTax {
  /** basis points, e.g. 1500 = 15% */
  rateBps: number;
  /** Display label, e.g. "VAT", "TVA", "GST". Empty when rateBps=0 and reverseCharge=false. */
  label: string;
  /** True when the buyer is responsible for accounting for the tax (zero-rated invoice with note). */
  reverseCharge: boolean;
  /** Free-text legal note rendered on the invoice (e.g. reverse-charge clause, export zero-rating). */
  note: string | null;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

// ---------------------------------------------------------------------------
// Invoice (public projection)
// ---------------------------------------------------------------------------

export interface PublicInvoice {
  id: string;
  number: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  contractId: string | null;
  milestoneId: string | null;
  payoutId: string | null;
  issuerName: string;
  issuerCountry: string | null;
  issuerTaxId: string | null;
  issuerAddress: string | null;
  recipientName: string;
  recipientCountry: string | null;
  recipientTaxId: string | null;
  recipientAddress: string | null;
  currency: string;
  subtotalCents: number;
  taxRateBps: number;
  taxAmountCents: number;
  totalCents: number;
  taxLabel: string | null;
  taxNote: string | null;
  reverseCharge: boolean;
  lineItems: InvoiceLineItem[];
  issuedAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  replacesInvoiceId: string | null;
  notes: string | null;
}

export interface InvoiceListQuery {
  /** Optional kind filter for the company / trainer dashboards. */
  kind?: InvoiceKind;
  /** Filter by status. */
  status?: InvoiceStatus;
  /** Pagination. */
  cursor?: string;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Pure tax math helpers (shared between API + web for parity)
// ---------------------------------------------------------------------------

/**
 * Split a gross amount into subtotal + tax for an *inclusive* tax rate.
 * Uses banker-style rounding on tax to avoid sub-cent leakage.
 *
 *   computeTaxInclusive(11500, 1500) → { subtotal: 10000, tax: 1500 }
 *
 * Returns subtotal=gross, tax=0 when rateBps=0 (covers export zero-rate
 * and reverse-charge cases — the caller still records the rate label
 * for invoice display).
 */
export function computeTaxInclusive(
  totalCents: number,
  rateBps: number,
): { subtotalCents: number; taxAmountCents: number } {
  if (rateBps <= 0 || totalCents <= 0) {
    return { subtotalCents: totalCents, taxAmountCents: 0 };
  }
  // total = subtotal * (1 + rate). Solve for subtotal then derive tax
  // so subtotal + tax === total exactly (avoids penny drift).
  const subtotal = Math.round((totalCents * 10_000) / (10_000 + rateBps));
  const tax = totalCents - subtotal;
  return { subtotalCents: subtotal, taxAmountCents: tax };
}

/**
 * Compute tax on an *exclusive* subtotal, returning the gross total.
 *
 *   computeTaxExclusive(10000, 1500) → { tax: 1500, total: 11500 }
 */
export function computeTaxExclusive(
  subtotalCents: number,
  rateBps: number,
): { taxAmountCents: number; totalCents: number } {
  if (rateBps <= 0 || subtotalCents <= 0) {
    return { taxAmountCents: 0, totalCents: subtotalCents };
  }
  const tax = Math.round((subtotalCents * rateBps) / 10_000);
  return { taxAmountCents: tax, totalCents: subtotalCents + tax };
}
