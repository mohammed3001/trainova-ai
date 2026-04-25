import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/config';
import { AdvertiseForm } from './advertise-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.advertise' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/advertise',
    locale: locale as Locale,
  });
}

export default async function AdvertisePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('marketing.advertise');

  const packages = [
    'FEATURED_COMPANY',
    'SPONSORED_TRAINER',
    'CATEGORY_SPONSOR',
    'NEWSLETTER',
    'CUSTOM',
  ] as const;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 px-6 py-16 text-white sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.25) 0, transparent 35%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl space-y-4 text-center">
          <span className="badge bg-white/15 text-white">{t('hero.eyebrow')}</span>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t('hero.title')}</h1>
          <p className="text-lg text-white/95">{t('hero.body')}</p>
        </div>
      </section>

      <section aria-labelledby="ad-packages" className="space-y-6">
        <h2 id="ad-packages" className="text-2xl font-semibold text-slate-900">
          {t('packagesSection.title')}
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {packages.map((p) => (
            <article
              key={p}
              className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
            >
              <div className="text-sm font-medium uppercase tracking-wide text-brand-700">
                {t(`packages.${p}.eyebrow`)}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">
                {t(`packages.${p}.title`)}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{t(`packages.${p}.body`)}</p>
              <p className="mt-4 text-base font-semibold text-slate-900">
                {t(`packages.${p}.price`)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="ad-enquiry" className="space-y-4">
        <h2 id="ad-enquiry" className="text-2xl font-semibold text-slate-900">
          {t('enquiry.title')}
        </h2>
        <p className="max-w-2xl text-slate-600">{t('enquiry.body')}</p>
        <AdvertiseForm locale={locale} />
      </section>
    </div>
  );
}
