import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface PathListRow {
  id: string;
  slug: string;
  title: string;
  summary: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  industry: string | null;
  estimatedHours: number;
  publishedAt: string | null;
  _count: { steps: number; enrollments: number };
}

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'learning' });
  return buildMetadata({
    title: t('title'),
    description: t('subtitle'),
    path: '/learning',
    locale: locale as Locale,
  });
}

export default async function LearningIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; level?: string; industry?: string }>;
}) {
  const { locale } = await params;
  const { q, level, industry } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'learning' });
  const qs = new URLSearchParams();
  if (q) qs.set('q', q);
  if (level) qs.set('level', level);
  if (industry) qs.set('industry', industry);
  const items = await apiFetch<PathListRow[]>(`/learning-paths?${qs.toString()}`);

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-2 text-slate-600">{t('subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder={t('filter.search')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="level"
          defaultValue={level ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('filter.all')}</option>
          <option value="BEGINNER">{t('level.BEGINNER')}</option>
          <option value="INTERMEDIATE">{t('level.INTERMEDIATE')}</option>
          <option value="ADVANCED">{t('level.ADVANCED')}</option>
        </select>
        <input
          name="industry"
          type="text"
          defaultValue={industry ?? ''}
          placeholder={t('filter.industry')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('filter.apply')}
        </button>
      </form>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-slate-500">
          {t('list.empty')}
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {items.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">
                  <Link href={`/${locale}/learning/${p.slug}`} className="hover:underline">
                    {p.title}
                  </Link>
                </h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {t(`level.${p.level}`)}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600">{p.summary}</p>
              <p className="mt-3 text-xs text-slate-500">
                {t('list.steps', { count: p._count.steps })} ·{' '}
                {t('list.enrolled', { count: p._count.enrollments })} ·{' '}
                {t('list.hours', { hours: p.estimatedHours })}
              </p>
              <Link
                href={`/${locale}/learning/${p.slug}`}
                className="mt-4 inline-block text-sm font-semibold text-brand-700 hover:text-brand-800"
              >
                {t('list.open')} →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
