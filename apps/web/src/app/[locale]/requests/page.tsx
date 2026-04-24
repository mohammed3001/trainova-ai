import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { JsonLd } from '@/components/json-ld';
import {
  absoluteUrl,
  breadcrumbLd,
  buildMetadata,
  collectionPageLd,
  siteUrl,
} from '@/lib/seo';
import type { Locale } from '@/i18n/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.requestsList' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/requests',
    locale: locale as Locale,
  });
}

interface RequestItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  modelFamily: string | null;
  industry: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  durationDays: number | null;
  publishedAt: string | null;
  company: { name: string; slug: string; logoUrl: string | null; country: string | null; verified: boolean };
  skills: { skill: { id: string; slug: string; nameEn: string; nameAr: string } }[];
}

export default async function RequestsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const data = await apiFetch<{ items: RequestItem[]; total: number }>('/job-requests?limit=24').catch(() => ({
    items: [],
    total: 0,
  }));

  const pageUrl = absoluteUrl('/requests', locale as Locale);
  const seoT = await getTranslations({ locale, namespace: 'seo.requestsList' });
  const ld = [
    collectionPageLd({ name: seoT('title'), description: seoT('description'), url: pageUrl }),
    breadcrumbLd([
      { name: t('common.appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('title'), url: pageUrl },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd data={ld} />
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('requests.listTitle')}</h1>
        <p className="text-sm text-slate-500">{data.total} results</p>
      </div>
      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500">{t('requests.noResults')}</div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.items.map((r) => (
            <li key={r.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link
                    href={`/${locale}/requests/${r.slug}`}
                    className="text-lg font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {r.title}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.company.name}
                    {r.company.country ? ` · ${r.company.country}` : ''}
                  </div>
                </div>
                {r.company.verified ? <span className="badge-accent">Verified</span> : null}
              </div>
              <p className="mt-3 line-clamp-3 text-sm text-slate-600">{r.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.skills.slice(0, 5).map((s) => (
                  <span key={s.skill.id} className="badge">
                    {locale === 'ar' ? s.skill.nameAr : s.skill.nameEn}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                {r.modelFamily ? (
                  <span>
                    {t('requests.model')}: <b>{r.modelFamily}</b>
                  </span>
                ) : null}
                {r.industry ? (
                  <span>
                    {t('requests.industry')}: <b>{r.industry}</b>
                  </span>
                ) : null}
                {r.budgetMin || r.budgetMax ? (
                  <span>
                    {t('requests.budget')}: <b>${r.budgetMin ?? 0}–${r.budgetMax ?? 0}</b>
                  </span>
                ) : null}
                {r.durationDays ? (
                  <span>
                    {t('requests.duration')}: <b>{r.durationDays} {t('requests.days')}</b>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
