import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { TrainerMatch } from '@trainova/shared';

export interface TrainerMatchCardProps {
  match: TrainerMatch;
  locale: string;
  viewerRole: 'COMPANY' | 'ADMIN';
  trainerHref?: string;
  rateLabel?: string;
}

/**
 * Server component that renders a trainer match row with score breakdown.
 * Reused by the company suggested-trainers panel and the admin matching
 * dashboard so both surfaces stay visually consistent.
 */
export function TrainerMatchCard({
  match,
  viewerRole,
  trainerHref,
  rateLabel,
}: TrainerMatchCardProps) {
  return (
    <article
      className="card space-y-4"
      data-testid={`match-card-${match.trainerId}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {trainerHref ? (
              <Link
                href={trainerHref}
                className="text-base font-semibold text-slate-900 hover:text-brand-700"
              >
                {match.trainerName}
              </Link>
            ) : (
              <span className="text-base font-semibold text-slate-900">
                {match.trainerName}
              </span>
            )}
            {match.breakdown.trust.verified ? (
              <VerifiedDot />
            ) : null}
          </div>
          <div className="text-xs text-slate-500">
            {match.headline ?? match.trainerEmail}
          </div>
          {match.country || rateLabel ? (
            <div className="text-xs text-slate-500">
              {match.country ?? ''}
              {match.country && rateLabel ? ' · ' : ''}
              {rateLabel ?? ''}
            </div>
          ) : null}
        </div>
        <ScoreBadge score={match.score} />
      </header>

      <BreakdownRow breakdown={match.breakdown} />

      {viewerRole === 'ADMIN' ? (
        <AdminFootnote breakdown={match.breakdown} />
      ) : null}
    </article>
  );
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

function VerifiedDot() {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white"
      title="verified"
      aria-label="verified"
    >
      ✓
    </span>
  );
}

function BreakdownRow({
  breakdown,
}: {
  breakdown: TrainerMatch['breakdown'];
}) {
  const t = useTranslations();
  const rows = [
    { key: 'skills', score: breakdown.skills.score, label: t('matching.breakdown.skills') },
    { key: 'languages', score: breakdown.languages.score, label: t('matching.breakdown.languages') },
    { key: 'rate', score: breakdown.rate.score, label: t('matching.breakdown.rate') },
    { key: 'trust', score: breakdown.trust.score, label: t('matching.breakdown.trust') },
    { key: 'history', score: breakdown.history.score, label: t('matching.breakdown.history') },
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
          </dd>
        </div>
      ))}
    </dl>
  );
}

function AdminFootnote({
  breakdown,
}: {
  breakdown: TrainerMatch['breakdown'];
}) {
  const t = useTranslations();
  const required = breakdown.skills.requiredSatisfied;
  const matchedCount = breakdown.skills.matchedSkillIds.length;
  const missingCount = breakdown.skills.missingSkillIds.length;
  const langCount = breakdown.languages.matched.length;
  const portfolioCount = breakdown.trust.portfolioCount;
  const accepted = breakdown.history.acceptedApplications;
  const total = breakdown.history.pastApplications;
  return (
    <footer className="flex flex-wrap gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
      <span>
        {t('matching.breakdown.skillsSummary', {
          matched: matchedCount,
          missing: missingCount,
        })}
      </span>
      <span>
        {required
          ? t('matching.breakdown.skillsRequiredOk')
          : t('matching.breakdown.skillsRequiredMissing')}
      </span>
      <span>
        {t('matching.breakdown.languagesSummary', { count: langCount })}
      </span>
      <span>
        {t('matching.breakdown.portfolioSummary', { count: portfolioCount })}
      </span>
      <span>
        {t('matching.breakdown.historySummary', {
          accepted,
          total,
        })}
      </span>
    </footer>
  );
}
