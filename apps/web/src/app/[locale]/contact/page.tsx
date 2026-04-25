import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, buildMetadata, siteUrl, type JsonLdObject } from '@/lib/seo';
import type { Locale } from '@/i18n/config';
import { ContactForm } from './contact-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.contact' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/contact',
    locale: locale as Locale,
  });
}

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('marketing.contact');

  const orgLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Trainova AI',
    url: siteUrl(),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'support@trainova.ai',
        availableLanguage: ['en', 'ar', 'fr', 'es'],
      },
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        email: 'sales@trainova.ai',
        availableLanguage: ['en', 'ar', 'fr', 'es'],
      },
    ],
  };

  return (
    <div className="space-y-10">
      <JsonLd data={orgLd} />

      <header className="space-y-3">
        <span className="badge">{t('hero.eyebrow')}</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {t('hero.title')}
        </h1>
        <p className="max-w-2xl text-slate-600">{t('hero.body')}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <ContactForm locale={locale} />

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 to-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-700">
              {t('contactInfo.title')}
            </h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-900">{t('contactInfo.support')}</dt>
                <dd>
                  <a className="text-brand-700 hover:underline" href="mailto:support@trainova.ai">
                    support@trainova.ai
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">{t('contactInfo.sales')}</dt>
                <dd>
                  <a className="text-brand-700 hover:underline" href="mailto:sales@trainova.ai">
                    sales@trainova.ai
                  </a>
                </dd>
              </div>
              <div>
                <dt className="font-medium text-slate-900">{t('contactInfo.press')}</dt>
                <dd>
                  <a className="text-brand-700 hover:underline" href="mailto:press@trainova.ai">
                    press@trainova.ai
                  </a>
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t('faqLink.title')}
            </h2>
            <p className="mt-2 text-sm text-slate-700">{t('faqLink.body')}</p>
            <a
              className="btn-secondary mt-3 inline-flex"
              href={absoluteUrl('/faq', locale as Locale)}
            >
              {t('faqLink.cta')}
            </a>
          </section>
        </aside>
      </div>
    </div>
  );
}
