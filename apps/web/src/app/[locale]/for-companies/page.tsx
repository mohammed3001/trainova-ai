import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.forCompanies' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/for-companies',
    locale: locale as Locale,
  });
}

export default async function ForCompaniesPage() {
  const t = await getTranslations('marketing.forCompanies');
  const locale = await getLocale();

  const features = ['requestBuilder', 'evaluation', 'matching', 'chat', 'contracts', 'analytics'] as const;
  const tiers = ['free', 'pro', 'enterprise'] as const;

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-6 py-16 text-white sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 70%, rgba(255,255,255,0.2) 0, transparent 35%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl space-y-4 text-center">
          <span className="badge bg-white/10 text-white">{t('hero.eyebrow')}</span>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t('hero.title')}</h1>
          <p className="text-lg text-brand-50/95">{t('hero.body')}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href={`/${locale}/register?role=COMPANY_OWNER`}
              className="btn bg-white text-brand-700 hover:bg-brand-50"
            >
              {t('hero.ctaPrimary')}
            </Link>
            <Link
              href={`/${locale}/contact`}
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              {t('hero.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {features.map((k) => (
          <article
            key={k}
            className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
          >
            <h3 className="text-base font-semibold text-slate-900">{t(`features.${k}.title`)}</h3>
            <p className="mt-2 text-sm text-slate-600">{t(`features.${k}.body`)}</p>
          </article>
        ))}
      </section>

      <section aria-labelledby="company-tiers" className="space-y-6">
        <h2 id="company-tiers" className="text-2xl font-semibold text-slate-900">
          {t('tiers.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((k) => (
            <article
              key={k}
              className={`rounded-2xl border p-6 shadow-sm ${
                k === 'pro'
                  ? 'border-brand-600 bg-gradient-to-br from-brand-50 to-white ring-2 ring-brand-600/30'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="text-sm font-medium uppercase tracking-wide text-brand-700">
                {t(`tiers.${k}.eyebrow`)}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{t(`tiers.${k}.title`)}</h3>
              <p className="mt-2 text-2xl font-bold text-slate-900">{t(`tiers.${k}.price`)}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600">
                {[1, 2, 3, 4].map((idx) => (
                  <li key={idx} className="flex gap-2">
                    <span aria-hidden className="text-brand-700">✓</span>
                    <span>{t(`tiers.${k}.bullet${idx}`)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/${locale}/pricing`}
                className="btn-primary mt-5 inline-flex w-full justify-center"
              >
                {t(`tiers.${k}.cta`)}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-slate-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t('cta.bottomTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('cta.bottomBody')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/register?role=COMPANY_OWNER`} className="btn-primary">
            {t('cta.startFree')}
          </Link>
          <Link href={`/${locale}/how-it-works`} className="btn-ghost">
            {t('cta.howItWorks')}
          </Link>
        </div>
      </section>
    </div>
  );
}
