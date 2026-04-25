import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, getLocaleDir, type Locale } from '@/i18n/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { JsonLd } from '@/components/json-ld';
import { organizationLd, websiteLd } from '@/lib/seo';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(locales as readonly string[]).includes(locale)) notFound();
  const messages = await getMessages();
  const t = await getTranslations('a11y');
  const dir = getLocaleDir(locale as Locale);
  return (
    <html lang={locale} dir={dir} className="antialiased">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        {/* Skip link: the first focusable stop on every page so
            keyboard + screen-reader users can jump past the global
            header + nav straight to the page's <main>. */}
        <a href="#main-content" className="skip-link">
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <SiteHeader />
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-6xl px-4 py-8 focus:outline-none sm:px-6 lg:px-8"
          >
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
        {/* Organization + WebSite JSON-LD are emitted once per rendered page
            because Google accepts (and prefers) both global-scope entities to
            appear alongside page-scoped ones like Person / JobPosting. */}
        <JsonLd data={[organizationLd(), websiteLd()]} />
      </body>
    </html>
  );
}
