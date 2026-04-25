import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { JsonLd } from '@/components/json-ld';
import { buildMetadata, type JsonLdObject } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface FaqEntry {
  id: string;
  section: string;
  question: string;
  answer: string;
  order: number;
}

export const revalidate = 3600;

function cmsLocaleOf(locale: string) {
  return locale === 'ar' ? 'AR' : locale === 'fr' ? 'FR' : locale === 'es' ? 'ES' : 'EN';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.faq' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/faq',
    locale: locale as Locale,
  });
}

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('marketing.faq');

  const entries = await apiFetch<FaqEntry[]>(
    `/public/cms/faq?locale=${cmsLocaleOf(locale)}`,
  ).catch(() => [] as FaqEntry[]);

  // Group by section preserving original order.
  const sections = new Map<string, FaqEntry[]>();
  for (const e of entries) {
    if (!sections.has(e.section)) sections.set(e.section, []);
    sections.get(e.section)!.push(e);
  }

  const faqLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: entries.map((e) => ({
      '@type': 'Question',
      name: e.question,
      acceptedAnswer: { '@type': 'Answer', text: e.answer },
    })),
  };

  return (
    <div className="space-y-10">
      {entries.length > 0 ? <JsonLd data={faqLd} /> : null}

      <header className="space-y-3">
        <span className="badge">{t('hero.eyebrow')}</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {t('hero.title')}
        </h1>
        <p className="max-w-2xl text-slate-600">{t('hero.body')}</p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          {t('empty')}
        </p>
      ) : (
        <div className="space-y-10">
          {[...sections.entries()].map(([section, items]) => (
            <section key={section} aria-labelledby={`faq-section-${section}`} className="space-y-4">
              <h2
                id={`faq-section-${section}`}
                className="text-xl font-semibold text-slate-900"
              >
                {section}
              </h2>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {items.map((e, idx) => (
                  <details
                    key={e.id}
                    className={`group ${idx === 0 ? '' : 'border-t border-slate-200'}`}
                  >
                    <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-slate-900 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600">
                      <span className="flex items-start justify-between gap-4">
                        <span>{e.question}</span>
                        <span
                          aria-hidden
                          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition group-open:rotate-45"
                        >
                          +
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4 text-sm leading-relaxed text-slate-700 whitespace-pre-line">
                      {e.answer}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
