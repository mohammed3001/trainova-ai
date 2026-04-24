import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { JsonLd } from '@/components/json-ld';
import {
  absoluteUrl,
  breadcrumbLd,
  buildMetadata,
  personLd,
  siteUrl,
} from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface TrainerDetail {
  id: string;
  slug: string;
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone: string | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  verified: boolean;
  linkedinUrl: string | null;
  githubUrl?: string | null;
  websiteUrl?: string | null;
  user: { id: string; name: string; createdAt: string; avatarUrl?: string | null };
  skills: {
    level: string;
    yearsExperience: number | null;
    skill: { nameEn: string; nameAr: string; slug: string };
  }[];
}

async function fetchTrainer(slug: string): Promise<TrainerDetail | null> {
  try {
    return await apiFetch<TrainerDetail>(`/trainers/${slug}`);
  } catch {
    return null;
  }
}

function skillName(
  s: { skill: { nameEn: string; nameAr: string } },
  locale: string,
): string {
  return locale === 'ar' ? s.skill.nameAr : s.skill.nameEn;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const trainer = await fetchTrainer(slug);
  if (!trainer) {
    // `notFound()` in generateMetadata is not supported — returning an empty
    // object lets Next.js 404 via the page below while the crawler sees a
    // valid (noindex) response.
    return { robots: { index: false, follow: false } };
  }
  const t = await getTranslations({ locale, namespace: 'seo.trainer' });
  const skillSummary = trainer.skills
    .slice(0, 4)
    .map((s) => skillName(s, locale))
    .join(', ');
  const countryAffix = trainer.country ? t('countryAffix', { country: trainer.country }) : '';
  const title = t('titleTemplate', {
    name: trainer.user.name,
    headline: trainer.headline || t('defaultHeadline'),
  });
  const description = t('descriptionTemplate', {
    name: trainer.user.name,
    skills: skillSummary || t('defaultHeadline'),
    country: countryAffix,
  }).trim();
  return buildMetadata({
    title,
    description,
    path: `/trainers/${trainer.slug}`,
    locale: locale as Locale,
    ogType: 'profile',
    image: trainer.user.avatarUrl ?? undefined,
  });
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const trainer = await fetchTrainer(slug);
  if (!trainer) notFound();

  const pageUrl = absoluteUrl(`/trainers/${trainer.slug}`, locale as Locale);
  const trainersIndexUrl = absoluteUrl('/trainers', locale as Locale);
  const seoT = await getTranslations({ locale, namespace: 'seo' });
  const commonT = await getTranslations({ locale, namespace: 'common' });
  const ld = [
    personLd({
      name: trainer.user.name,
      url: pageUrl,
      jobTitle: trainer.headline || seoT('trainer.defaultHeadline'),
      description: trainer.bio,
      country: trainer.country,
      image: trainer.user.avatarUrl ?? null,
      sameAs: [trainer.linkedinUrl, trainer.githubUrl ?? null, trainer.websiteUrl ?? null],
      knowsAbout: trainer.skills.map((s) => skillName(s, locale)),
    }),
    breadcrumbLd([
      { name: commonT('appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('trainersList.title'), url: trainersIndexUrl },
      { name: trainer.user.name, url: pageUrl },
    ]),
  ];

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <JsonLd data={ld} />
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{trainer.user.name}</h1>
            <p className="text-slate-500">{trainer.headline}</p>
            <p className="text-xs text-slate-400">
              {trainer.country ? trainer.country + ' · ' : ''}
              {trainer.languages.join(', ')}
            </p>
          </div>
          {trainer.verified ? <span className="badge-accent">Verified</span> : null}
        </div>
        {trainer.bio ? (
          <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{trainer.bio}</p>
        ) : null}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">Skills</h2>
        <ul className="mt-3 space-y-2">
          {trainer.skills.map((s) => (
            <li
              key={s.skill.slug}
              className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <span>{skillName(s, locale)}</span>
              <span className="text-xs text-slate-500">
                {s.level}
                {s.yearsExperience ? ` · ${s.yearsExperience}y` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
