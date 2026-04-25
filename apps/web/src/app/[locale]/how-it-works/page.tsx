import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { JsonLd } from '@/components/json-ld';
import { buildMetadata, absoluteUrl, type JsonLdObject } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.howItWorks' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/how-it-works',
    locale: locale as Locale,
  });
}

export default async function HowItWorksPage() {
  const t = await getTranslations('marketing.howItWorks');
  const locale = await getLocale();

  const steps = [1, 2, 3, 4, 5, 6] as const;

  const howToLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: t('hero.title'),
    description: t('hero.body'),
    inLanguage: locale,
    totalTime: 'PT2H',
    step: steps.map((i) => ({
      '@type': 'HowToStep',
      position: i,
      name: t(`steps.${i}.title`),
      text: t(`steps.${i}.body`),
      url: `${absoluteUrl('/how-it-works', locale as Locale)}#step-${i}`,
    })),
  };

  return (
    <div className="space-y-16">
      <JsonLd data={howToLd} />
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 px-6 py-16 text-white sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.25) 0, transparent 35%)',
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
              {t('cta.companyPrimary')}
            </Link>
            <Link
              href={`/${locale}/register?role=TRAINER`}
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              {t('cta.trainerSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="three-products" className="space-y-6">
        <h2 id="three-products" className="text-2xl font-semibold text-slate-900">
          {t('threeProducts.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['marketplace', 'evaluation', 'workspace'] as const).map((k) => (
            <article
              key={k}
              className="rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur"
            >
              <div className="text-sm font-medium uppercase tracking-wide text-brand-700">
                {t(`threeProducts.${k}.eyebrow`)}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">
                {t(`threeProducts.${k}.title`)}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{t(`threeProducts.${k}.body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="steps" className="space-y-6">
        <h2 id="steps" className="text-2xl font-semibold text-slate-900">
          {t('steps.title')}
        </h2>
        <ol className="space-y-4">
          {steps.map((i) => (
            <li
              id={`step-${i}`}
              key={i}
              className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-brand-500 font-semibold text-white">
                {i}
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  {t(`steps.${i}.title`)}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{t(`steps.${i}.body`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl bg-slate-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t('cta.bottomTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('cta.bottomBody')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/for-companies`} className="btn-primary">
            {t('cta.forCompanies')}
          </Link>
          <Link href={`/${locale}/for-trainers`} className="btn-secondary">
            {t('cta.forTrainers')}
          </Link>
          <Link href={`/${locale}/pricing`} className="btn-ghost">
            {t('cta.pricing')}
          </Link>
        </div>
      </section>
    </div>
  );
}
