/**
 * T6.A — Currency catalog + display formatter.
 *
 * Authoritative monetary values (contracts, payouts, payment intents,
 * subscription plans, ad spend) stay in the source currency declared on
 * the row itself; we never round-trip stored amounts through FX. This
 * module is *display only*: it formats and converts for presentation
 * using the user's `currencyPreference`, falling back to the source
 * currency when the user hasn't expressed a preference or when no rate
 * is available for the target.
 */

import { z } from 'zod';

/**
 * ISO 4217 codes the platform formally supports. Adding to this list
 * requires (1) ensuring `Intl.NumberFormat` knows the symbol, (2)
 * verifying the Frankfurter API exposes the pair, and (3) updating any
 * Stripe payment-method gating that depends on currency.
 */
export const SUPPORTED_DISPLAY_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'SAR',
  'AED',
  'EGP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'INR',
  'TRY',
] as const;
export type DisplayCurrency = (typeof SUPPORTED_DISPLAY_CURRENCIES)[number];

/** Subset of currencies that are *zero-decimal* per ISO 4217. */
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

export function isZeroDecimal(code: string): boolean {
  return ZERO_DECIMAL.has(code.toUpperCase());
}

export function minorUnits(code: string): number {
  return isZeroDecimal(code) ? 1 : 100;
}

export const currencyCodeSchema = z
  .string()
  .min(3)
  .max(3)
  .regex(/^[A-Z]{3}$/, 'must be a 3-letter ISO 4217 code');

/** A `(base→quote)` rate snapshot. Always anchored to USD on the server. */
export interface FxRate {
  base: DisplayCurrency | string;
  quote: DisplayCurrency | string;
  rate: number;
  fetchedAt: string; // ISO timestamp
}

/**
 * Convert an amount in *minor units* (cents for two-decimal currencies,
 * whole units for zero-decimal) from `from` → `to`. Returns null when no
 * route is available — callers should fall back to displaying the source
 * currency unchanged.
 */
export function convertMinorUnits(
  amount: number,
  from: string,
  to: string,
  rates: ReadonlyArray<FxRate>,
): number | null {
  const F = from.toUpperCase();
  const T = to.toUpperCase();
  if (F === T) return amount;
  // Convert to a "major" amount in source, hop through USD, scale to target.
  const fromMajor = amount / minorUnits(F);
  const toUsd = F === 'USD' ? fromMajor : convertVia(fromMajor, F, 'USD', rates);
  if (toUsd == null) return null;
  const toMajor = T === 'USD' ? toUsd : convertVia(toUsd, 'USD', T, rates);
  if (toMajor == null) return null;
  return Math.round(toMajor * minorUnits(T));
}

function convertVia(
  amount: number,
  from: string,
  to: string,
  rates: ReadonlyArray<FxRate>,
): number | null {
  // Direct rate
  const direct = rates.find((r) => r.base === from && r.quote === to);
  if (direct) return amount * direct.rate;
  // Inverse rate (we only fetch USD-anchored, so the inverse is the
  // foreign→USD path).
  const inverse = rates.find((r) => r.base === to && r.quote === from);
  if (inverse && inverse.rate !== 0) return amount / inverse.rate;
  return null;
}

/**
 * Format an amount in *minor units* of `code` for display in `locale`.
 * Always formats in the *source* currency — pair with `convertMinorUnits`
 * upstream when the user wants a different display currency.
 */
export function formatMoney(
  amountMinor: number,
  code: string,
  locale: string = 'en',
): string {
  const major = amountMinor / minorUnits(code);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      currencyDisplay: 'symbol',
    }).format(major);
  } catch {
    // Unsupported currency on this runtime — fall back to a manual format
    // rather than throwing in render code.
    return `${code} ${major.toFixed(isZeroDecimal(code) ? 0 : 2)}`;
  }
}
