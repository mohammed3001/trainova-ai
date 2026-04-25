export const locales = ['en', 'ar', 'fr', 'es'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'en';

const RTL_LOCALES: ReadonlySet<string> = new Set(['ar']);
export function getLocaleDir(locale: Locale): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}
