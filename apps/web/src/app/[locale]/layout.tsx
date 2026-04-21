import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, getLocaleDir, type Locale } from '@/i18n/config';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

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
  const dir = getLocaleDir(locale as Locale);
  return (
    <html lang={locale} dir={dir} className="antialiased">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
