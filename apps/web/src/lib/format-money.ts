/**
 * Format integer cents as a localized currency string. Defaults to USD
 * with the user's preferred locale fallback chain handled by the
 * Intl.NumberFormat polyfill.
 */
export function formatCents(amountCents: number, currency = 'USD', locale = 'en-US'): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amountCents / 100);
  } catch {
    return `${currency} ${(amountCents / 100).toFixed(2)}`;
  }
}
