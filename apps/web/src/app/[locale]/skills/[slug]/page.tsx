import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
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

interface SkillDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  trainerSkills: {
    profile: { slug: string; headline: string; country: string | null; user: { name: string } };
  }[];
  requestSkills: {
    request: {
      id: string;
      slug: string;
      title: string;
      modelFamily: string | null;
      industry: string | null;
      status: string;
      company: { name: string; slug: string };
    };
  }[];
}

async function fetchSkill(slug: string): Promise<SkillDetail | null> {
  try {
    return await apiFetch<SkillDetail>(`/skills/${slug}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const data = await fetchSkill(slug);
  if (!data) return { robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: 'seo.skill' });
  const name = locale === 'ar' ? data.nameAr : data.nameEn;
  return buildMetadata({
    title: t('titleTemplate', { name }),
    description: t('descriptionTemplate', { name }),
    path: `/skills/${data.slug}`,
    locale: locale as Locale,
  });
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const data = await fetchSkill(slug);
  if (!data) notFound();
  const name = locale === 'ar' ? data.nameAr : data.nameEn;

  const pageUrl = absoluteUrl(`/skills/${data.slug}`, locale as Locale);
  const skillsIndexUrl = absoluteUrl('/skills', locale as Locale);
  const seoT = await getTranslations({ locale, namespace: 'seo' });
  const commonT = await getTranslations({ locale, namespace: 'common' });
  const ld = [
    collectionPageLd({
      name: seoT('skill.titleTemplate', { name }),
      description: seoT('skill.descriptionTemplate', { name }),
      url: pageUrl,
    }),
    breadcrumbLd([
      { name: commonT('appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('skillsList.title'), url: skillsIndexUrl },
      { name, url: pageUrl },
    ]),
  ];

  return (
    <div className="space-y-8">
      <JsonLd data={ld} />
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
        <p className="text-slate-500">{seoT('skill.descriptionTemplate', { name })}</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Top trainers</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.trainerSkills.map((ts) => (
            <li key={ts.profile.slug} className="card">
              <Link
                href={`/${locale}/trainers/${ts.profile.slug}`}
                className="font-semibold text-slate-900 hover:text-brand-700"
              >
                {ts.profile.user.name}
              </Link>
              <p className="text-xs text-slate-500">
                {ts.profile.headline}
                {ts.profile.country ? ` · ${ts.profile.country}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Related open requests</h2>
        <ul className="space-y-3">
          {data.requestSkills
            .filter((rs) => rs.request.status === 'OPEN')
            .map((rs) => (
              <li key={rs.request.id} className="card">
                <Link
                  href={`/${locale}/requests/${rs.request.slug}`}
                  className="font-semibold text-slate-900 hover:text-brand-700"
                >
                  {rs.request.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {rs.request.company.name}
                  {rs.request.modelFamily ? ` · ${rs.request.modelFamily}` : ''}
                </p>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
