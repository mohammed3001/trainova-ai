import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, locales, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = (locales as readonly string[]).includes(requested ?? '')
    ? ((requested as Locale) ?? defaultLocale)
    : defaultLocale;
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});
