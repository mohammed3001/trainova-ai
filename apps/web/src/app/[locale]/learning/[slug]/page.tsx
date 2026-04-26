import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { authedFetch } from '@/lib/authed-fetch';
import { buildMetadata } from '@/lib/seo';
import { getToken } from '@/lib/session';
import type { Locale } from '@/i18n/config';
import { LearningPathActions } from './_actions';

interface Step {
  id: string;
  position: number;
  kind: 'ARTICLE' | 'LINK' | 'VIDEO' | 'REFLECTION';
  title: string;
  body: string;
  url: string | null;
}

interface PathDetail {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  industry: string | null;
  estimatedHours: number;
  publishedAt: string | null;
  steps: Step[];
}

interface EnrollmentSnapshot {
  path: PathDetail;
  enrollment: {
    id: string;
    completedAt: string | null;
    progress: { stepId: string }[];
    certificate: { serial: string; issuedAt: string } | null;
  };
}

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const path = await apiFetch<PathDetail>(`/learning-paths/${slug}`);
    return buildMetadata({
      title: path.title,
      description: path.summary,
      path: `/learning/${slug}`,
      locale: locale as Locale,
    });
  } catch {
    return {};
  }
}

export default async function LearningPathDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations({ locale, namespace: 'learning' });
  const token = await getToken();

  let path: PathDetail;
  try {
    path = await apiFetch<PathDetail>(`/learning-paths/${slug}`);
  } catch {
    notFound();
  }

  // If logged in, attempt to fetch enrollment snapshot. 404 means not yet
  // enrolled — that's expected and shouldn't surface as an error.
  let snapshot: EnrollmentSnapshot | null = null;
  if (token) {
    try {
      snapshot = await authedFetch<EnrollmentSnapshot>(
        `/learning-paths/${slug}/enrollment`,
      );
    } catch {
      snapshot = null;
    }
  }

  const completedIds = new Set(snapshot?.enrollment.progress.map((p) => p.stepId) ?? []);
  const isCompleted = !!snapshot?.enrollment.completedAt;
  const certificate = snapshot?.enrollment.certificate ?? null;
  const nextStep = snapshot
    ? path.steps.find((s) => !completedIds.has(s.id)) ?? null
    : null;

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-4 py-12">
      <header className="space-y-2">
        <span className="inline-block rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
          {t(`level.${path.level}`)}
        </span>
        <h1 className="text-3xl font-bold text-slate-900">{path.title}</h1>
        <p className="text-slate-600">{path.summary}</p>
        <p className="text-xs text-slate-500">
          {t('list.steps', { count: path.steps.length })} ·{' '}
          {t('list.hours', { hours: path.estimatedHours })}
          {path.industry ? ` · ${path.industry}` : ''}
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-xl font-semibold text-slate-900">{t('detail.aboutTitle')}</h2>
        <div className="prose prose-slate max-w-none whitespace-pre-line text-slate-700">
          {path.description}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">{t('detail.stepsTitle')}</h2>
        <ol className="space-y-3">
          {path.steps.map((step) => {
            const done = completedIds.has(step.id);
            return (
              <li
                key={step.id}
                className={`rounded-2xl border p-4 shadow-sm backdrop-blur-md ${
                  done
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-white/60 bg-white/70'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                      {step.position}. {t(`kind.${step.kind}`)}
                    </p>
                    <h3 className="mt-1 font-semibold text-slate-900">{step.title}</h3>
                  </div>
                  {done ? <span className="text-emerald-600">✓</span> : null}
                </div>
                {step.body ? (
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-600">
                    {step.body}
                  </p>
                ) : null}
                {step.url ? (
                  <a
                    href={step.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-2 inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {step.url}
                  </a>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        {!token ? (
          <Link
            href={`/${locale}/login?redirect=${encodeURIComponent(
              `/${locale}/learning/${slug}`,
            )}`}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('detail.loginToEnroll')}
          </Link>
        ) : (
          <LearningPathActions
            slug={slug}
            locale={locale}
            isEnrolled={!!snapshot}
            isCompleted={isCompleted}
            nextStep={nextStep}
            totalSteps={path.steps.length}
            doneSteps={completedIds.size}
            certificateSerial={certificate?.serial ?? null}
          />
        )}
      </section>
    </article>
  );
}
