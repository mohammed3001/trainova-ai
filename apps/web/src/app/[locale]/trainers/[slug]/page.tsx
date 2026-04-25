import Link from 'next/link';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { JsonLd } from '@/components/json-ld';
import { ReviewsPanel } from '@/components/reviews/reviews-panel';
import {
  absoluteUrl,
  breadcrumbLd,
  buildMetadata,
  personLd,
  siteUrl,
} from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface TrainerAsset {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  mimeType: string;
  byteLength: number;
  order: number;
  createdAt: string;
}

interface TrainerDetail {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone: string | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  availability: string | null;
  responseTimeHours: number | null;
  verified: boolean;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  user: { id: string; name: string; avatarUrl: string | null; createdAt: string };
  skills: {
    level: string | null;
    yearsExperience: number | null;
    skill: { nameEn: string; nameAr: string; slug: string };
  }[];
  assets: TrainerAsset[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function loadTrainer(slug: string): Promise<TrainerDetail | null> {
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
  const trainer = await loadTrainer(slug);
  if (!trainer) {
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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const tr = await loadTrainer(slug);
  if (!tr) notFound();

  const t = await getTranslations('trainerProfile');
  const seoT = await getTranslations({ locale, namespace: 'seo' });
  const commonT = await getTranslations({ locale, namespace: 'common' });

  const pageUrl = absoluteUrl(`/trainers/${tr.slug}`, locale as Locale);
  const trainersIndexUrl = absoluteUrl('/trainers', locale as Locale);
  const ld = [
    personLd({
      name: tr.user.name,
      url: pageUrl,
      jobTitle: tr.headline || seoT('trainer.defaultHeadline'),
      description: tr.bio,
      country: tr.country,
      image: tr.user.avatarUrl ?? null,
      sameAs: [tr.linkedinUrl, tr.githubUrl, tr.websiteUrl],
      knowsAbout: tr.skills.map((s) => skillName(s, locale)),
    }),
    breadcrumbLd([
      { name: commonT('appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('trainersList.title'), url: trainersIndexUrl },
      { name: tr.user.name, url: pageUrl },
    ]),
  ];

  const portfolio = tr.assets.filter((a) => a.kind === 'portfolio');
  const certs = tr.assets.filter((a) => a.kind === 'certificate');

  return (
    <>
      <JsonLd data={ld} />
      <article className="mx-auto max-w-4xl space-y-6">
        {/* Hero */}
        <section className="glass relative overflow-hidden">
          <div
            className="absolute inset-0 bg-gradient-to-br from-brand-500/10 via-violet-500/10 to-cyan-500/10"
            aria-hidden
          />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-start">
            <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-2xl font-semibold text-white shadow-lg ring-1 ring-white/50">
              {tr.user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={tr.user.avatarUrl} alt={tr.user.name} className="h-full w-full object-cover" />
              ) : (
                initials(tr.user.name)
              )}
            </div>
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold text-slate-900" data-testid="trainer-name">
                  {tr.user.name}
                </h1>
                {tr.verified ? (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                    data-testid="trainer-verified"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-3 w-3"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.5 3.75a.75.75 0 0 1 .75.75v.75h.75a.75.75 0 0 1 0 1.5h-.75v.75a.75.75 0 0 1-1.5 0v-.75H9a.75.75 0 0 1 0-1.5h.75V4.5a.75.75 0 0 1 .75-.75Zm6.97 4.72a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 1 1 1.06-1.06l2.47 2.47 5.47-5.47a.75.75 0 0 1 1.06 0Z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('verified')}
                  </span>
                ) : null}
              </div>
              {tr.headline ? (
                <p className="mt-1 text-sm text-slate-600" data-testid="trainer-headline">
                  {tr.headline}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {tr.country ? <span>📍 {tr.country}</span> : null}
                {tr.languages.length ? <span>🗣 {tr.languages.join(' · ')}</span> : null}
                {tr.timezone ? <span>🕒 {tr.timezone}</span> : null}
                {tr.responseTimeHours != null ? (
                  <span>⚡ {t('responseWithin', { hours: tr.responseTimeHours })}</span>
                ) : null}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={`${API_URL}/api/trainers/${tr.slug}/cv.pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  data-testid="trainer-download-cv"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.75}
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v13m0 0-4-4m4 4 4-4M5 21h14" />
                  </svg>
                  {t('downloadCv')}
                </a>
                {tr.linkedinUrl ? (
                  <a href={tr.linkedinUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    LinkedIn
                  </a>
                ) : null}
                {tr.githubUrl ? (
                  <a href={tr.githubUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    GitHub
                  </a>
                ) : null}
                {tr.websiteUrl ? (
                  <a href={tr.websiteUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    {t('website')}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        {(tr.hourlyRateMin != null ||
          tr.hourlyRateMax != null ||
          tr.availability ||
          tr.skills.length > 0) && (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="trainer-stats">
            {tr.hourlyRateMin != null || tr.hourlyRateMax != null ? (
              <div className="glass p-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{t('rate')}</div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  ${tr.hourlyRateMin ?? 0}–${tr.hourlyRateMax ?? 0}
                  <span className="text-sm font-normal text-slate-500"> / {t('hour')}</span>
                </div>
              </div>
            ) : null}
            {tr.availability ? (
              <div className="glass p-4">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">{t('availability')}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{tr.availability}</div>
              </div>
            ) : null}
            <div className="glass p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{t('skillsCount')}</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{tr.skills.length}</div>
            </div>
            <div className="glass p-4">
              <div className="text-[11px] uppercase tracking-wide text-slate-400">{t('memberSince')}</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {new Date(tr.user.createdAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en-US', {
                  year: 'numeric',
                  month: 'short',
                })}
              </div>
            </div>
          </section>
        )}

        {/* Bio */}
        {tr.bio ? (
          <section className="card">
            <h2 className="text-lg font-semibold text-slate-900">{t('about')}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700" data-testid="trainer-bio">
              {tr.bio}
            </p>
          </section>
        ) : null}

        {/* Skills */}
        {tr.skills.length ? (
          <section className="card">
            <h2 className="text-lg font-semibold text-slate-900">{t('skills')}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="trainer-skills">
              {tr.skills.map((s) => (
                <li
                  key={s.skill.slug}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 px-3 py-2 text-sm"
                >
                  <Link
                    href={`/${locale}/trainers?skill=${encodeURIComponent(s.skill.slug)}`}
                    className="font-medium text-slate-800 hover:text-brand-700"
                  >
                    {skillName(s, locale)}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">
                    {s.level ?? '—'}
                    {s.yearsExperience != null ? ` · ${s.yearsExperience}y` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Portfolio */}
        {portfolio.length ? (
          <section className="card">
            <h2 className="text-lg font-semibold text-slate-900">{t('portfolio')}</h2>
            <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="trainer-portfolio">
              {portfolio.map((a) => {
                const isImage = a.mimeType.startsWith('image/');
                return (
                  <li key={a.id} className="group overflow-hidden rounded-xl border border-slate-100 bg-white/80">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                      {isImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={a.url}
                          alt={a.title ?? ''}
                          className="h-40 w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="grid h-40 place-items-center bg-gradient-to-br from-slate-50 to-slate-100 text-xs text-slate-400">
                          {a.mimeType}
                        </div>
                      )}
                      <div className="px-3 py-2 text-sm font-medium text-slate-800">
                        {a.title ?? t('untitled')}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        {/* Certifications */}
        {certs.length ? (
          <section className="card">
            <h2 className="text-lg font-semibold text-slate-900">{t('certifications')}</h2>
            <ul className="mt-3 space-y-2" data-testid="trainer-certifications">
              {certs.map((a) => (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span aria-hidden className="text-lg">🎓</span>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-slate-800 hover:text-brand-700"
                  >
                    {a.title ?? a.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Reviews (T5.E — verified contract reviews) */}
        <ReviewsPanel trainerSlug={slug} locale={locale} />
      </article>
    </>
  );
}
