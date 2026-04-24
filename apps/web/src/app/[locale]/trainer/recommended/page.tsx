import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { JobMatch } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { formatCents } from '@/lib/format-money';

export const dynamic = 'force-dynamic';

export default async function TrainerRecommendedJobsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const matches = await authedFetch<JobMatch[]>(
    `/matching/me/recommended-jobs?limit=20`,
  ).catch(() => [] as JobMatch[]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">
          {t('matching.trainer.title')}
        </h1>
        <p className="max-w-2xl text-sm text-slate-500">
          {t('matching.trainer.subtitle')}
        </p>
      </header>

      {matches.length === 0 ? (
        <div className="card text-sm text-slate-500">
          {t('matching.trainer.empty')}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <li
              key={m.jobRequestId}
              className="card space-y-4"
              data-testid={`trainer-match-${m.jobRequestId}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Link
                    href={`/${locale}/requests/${m.slug}`}
                    className="text-lg font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {m.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {m.companyName}
                    {m.industry ? ` · ${m.industry}` : ''}
                    {' · '}
                    {t(`matching.workType.${m.workType.toLowerCase()}`)}
                  </div>
                  {m.budgetMin !== null || m.budgetMax !== null ? (
                    <div className="text-xs text-slate-500">
                      {budgetLabel(m.budgetMin, m.budgetMax, m.currency, locale)}
                    </div>
                  ) : null}
                </div>
                <ScoreBadge score={m.score} />
              </div>

              <BreakdownGrid breakdown={m.breakdown} t={t} />

              <div className="flex justify-end pt-2">
                <Link
                  href={`/${locale}/requests/${m.slug}`}
                  className="btn-primary"
                  data-testid={`trainer-match-cta-${m.jobRequestId}`}
                >
                  {t('matching.trainer.viewCta')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function budgetLabel(min: number | null, max: number | null, currency: string, locale: string) {
  const fmt = (cents: number) => formatCents(cents, currency, locale);
  if (min !== null && max !== null) return `${fmt(min)} – ${fmt(max)}`;
  if (min !== null) return `≥ ${fmt(min)}`;
  if (max !== null) return `≤ ${fmt(max)}`;
  return '';
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
      : score >= 60
        ? 'bg-brand-100 text-brand-700 ring-brand-200'
        : score >= 40
          ? 'bg-amber-100 text-amber-700 ring-amber-200'
          : 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <div
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}
      aria-label={`match score ${score}`}
    >
      <span className="text-base font-bold leading-none">{score}</span>
      <span className="text-[10px] uppercase tracking-wide opacity-80">/100</span>
    </div>
  );
}

function BreakdownGrid({
  breakdown,
  t,
}: {
  breakdown: JobMatch['breakdown'];
  t: (key: string) => string;
}) {
  const rows: { key: string; label: string; score: number; hint?: string }[] = [
    {
      key: 'skills',
      label: t('matching.breakdown.skills'),
      score: breakdown.skills.score,
      hint: breakdown.skills.requiredSatisfied
        ? t('matching.breakdown.skillsRequiredOk')
        : t('matching.breakdown.skillsRequiredMissing'),
    },
    {
      key: 'languages',
      label: t('matching.breakdown.languages'),
      score: breakdown.languages.score,
    },
    {
      key: 'rate',
      label: t('matching.breakdown.rate'),
      score: breakdown.rate.score,
    },
    {
      key: 'trust',
      label: t('matching.breakdown.trust'),
      score: breakdown.trust.score,
    },
    {
      key: 'history',
      label: t('matching.breakdown.history'),
      score: breakdown.history.score,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
      {rows.map((r) => (
        <div key={r.key} className="space-y-1">
          <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
            {r.label}
          </dt>
          <dd className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-400"
                style={{ width: `${r.score}%` }}
              />
            </div>
            <div className="font-semibold text-slate-700">{r.score}</div>
            {r.hint ? <div className="text-[10px] text-slate-500">{r.hint}</div> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
