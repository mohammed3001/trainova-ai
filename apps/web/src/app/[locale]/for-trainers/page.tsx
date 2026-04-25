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
  const t = await getTranslations({ locale, namespace: 'seo.forTrainers' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/for-trainers',
    locale: locale as Locale,
  });
}

export default async function ForTrainersPage() {
  const t = await getTranslations('marketing.forTrainers');
  const locale = await getLocale();

  const benefits = ['discoverability', 'fairTests', 'escrow', 'workbench', 'badges', 'global'] as const;
  const path = [1, 2, 3, 4] as const;

  return (
    <div className="space-y-16">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-700 via-fuchsia-600 to-amber-500 px-6 py-16 text-white sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.4) 0, transparent 40%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.25) 0, transparent 35%)',
          }}
        />
        <div className="relative mx-auto max-w-3xl space-y-4 text-center">
          <span className="badge bg-white/10 text-white">{t('hero.eyebrow')}</span>
          <h1 className="text-3xl font-bold tracking-tight md:text-5xl">{t('hero.title')}</h1>
          <p className="text-lg text-white/95">{t('hero.body')}</p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              href={`/${locale}/register?role=TRAINER`}
              className="btn bg-white text-indigo-700 hover:bg-white/90"
            >
              {t('hero.ctaPrimary')}
            </Link>
            <Link
              href={`/${locale}/requests`}
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              {t('hero.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {benefits.map((k) => (
          <article
            key={k}
            className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
          >
            <h3 className="text-base font-semibold text-slate-900">{t(`benefits.${k}.title`)}</h3>
            <p className="mt-2 text-sm text-slate-600">{t(`benefits.${k}.body`)}</p>
          </article>
        ))}
      </section>

      <section aria-labelledby="trainer-path" className="space-y-6">
        <h2 id="trainer-path" className="text-2xl font-semibold text-slate-900">
          {t('path.title')}
        </h2>
        <ol className="grid gap-4 md:grid-cols-4">
          {path.map((i) => (
            <li
              key={i}
              className="rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"
            >
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-700 to-fuchsia-500 font-semibold text-white">
                {i}
              </div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">{t(`path.${i}.title`)}</h3>
              <p className="mt-2 text-sm text-slate-600">{t(`path.${i}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t('earnings.title')}</h2>
          <p className="mt-2 text-sm text-slate-600">{t('earnings.body')}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {[1, 2, 3].map((i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="text-brand-700">✓</span>
                <span>{t(`earnings.bullet${i}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-slate-50 p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('verification.eyebrow')}
          </h3>
          <p className="mt-2 text-sm text-slate-700">{t('verification.body')}</p>
          <Link
            href={`/${locale}/register?role=TRAINER`}
            className="btn-primary mt-4 inline-flex"
          >
            {t('verification.cta')}
          </Link>
        </div>
      </section>

      <section className="rounded-2xl bg-slate-50 p-8 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{t('cta.bottomTitle')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('cta.bottomBody')}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <Link href={`/${locale}/register?role=TRAINER`} className="btn-primary">
            {t('cta.signUp')}
          </Link>
          <Link href={`/${locale}/how-it-works`} className="btn-ghost">
            {t('cta.howItWorks')}
          </Link>
        </div>
      </section>
    </div>
  );
}
