import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
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

interface Skill {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  category: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.skillsList' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/skills',
    locale: locale as Locale,
  });
}

export default async function SkillsPage() {
  const locale = await getLocale();
  const skills = await apiFetch<Skill[]>('/skills').catch(() => []);
  const pageUrl = absoluteUrl('/skills', locale as Locale);
  const seoT = await getTranslations({ locale, namespace: 'seo.skillsList' });
  const commonT = await getTranslations({ locale, namespace: 'common' });
  const ld = [
    collectionPageLd({ name: seoT('title'), description: seoT('description'), url: pageUrl }),
    breadcrumbLd([
      { name: commonT('appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('title'), url: pageUrl },
    ]),
  ];
  return (
    <div className="space-y-6">
      <JsonLd data={ld} />
      <h1 className="text-3xl font-bold text-slate-900">{seoT('title')}</h1>
      <p className="text-sm text-slate-500">{seoT('description')}</p>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {skills.map((s) => (
          <li key={s.id}>
            <Link
              href={`/${locale}/skills/${s.slug}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
            >
              {locale === 'ar' ? s.nameAr : s.nameEn}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
