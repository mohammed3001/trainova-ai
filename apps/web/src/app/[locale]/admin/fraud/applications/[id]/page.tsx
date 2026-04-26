import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ADMIN_ROLE_GROUPS, type RiskLevelLiteral } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ReviewActions } from '../../review-actions';

export const dynamic = 'force-dynamic';

type FraudDetail = {
  id: string;
  status: string;
  createdAt: string;
  coverLetter: string | null;
  proposedRate: number | null;
  proposedTimelineDays: number | null;
  answers: Record<string, unknown> | null;
  riskScore: number | null;
  riskLevel: RiskLevelLiteral | null;
  riskFlags: string[];
  riskComputedAt: string | null;
  riskReviewedAt: string | null;
  riskReviewedBy: string | null;
  riskReviewNote: string | null;
  trainer: {
    id: string;
    name: string;
    email: string;
    emailVerifiedAt: string | null;
    createdAt: string;
    trainerProfile: {
      slug: string;
      headline: string;
      country: string | null;
      verified: boolean;
    } | null;
  };
  request: {
    id: string;
    slug: string;
    title: string;
    budgetMin: number | null;
    budgetMax: number | null;
    applicationSchema: unknown;
    company: { name: string; slug: string };
  };
};

export default async function AdminFraudDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/fraud/applications/${id}`);
  if (!(ADMIN_ROLE_GROUPS.MODERATION as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}/dashboard`);
  }
  const t = await getTranslations({ locale, namespace: 'admin.fraud' });

  const data = await authedFetch<FraudDetail>(`/admin/fraud/applications/${id}`).catch(
    () => null,
  );
  if (!data) {
    return (
      <div className="space-y-4">
        <BackLink locale={locale} label={t('detail.back')} />
        <div className="card text-sm text-slate-500 dark:text-slate-400">
          {t('detail.notFound')}
        </div>
      </div>
    );
  }

  const dateFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const ageMs = new Date(data.createdAt).getTime() - new Date(data.trainer.createdAt).getTime();
  const ageHours = Math.max(0, Math.floor(ageMs / (60 * 60 * 1000)));
  const ageDays = Math.floor(ageHours / 24);

  return (
    <div className="space-y-6">
      <BackLink locale={locale} label={t('detail.back')} />

      <header className="card space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <RiskBadge level={data.riskLevel} score={data.riskScore} />
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {data.request.title}
              </h1>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('detail.company')}: {data.request.company.name} · {t('appliedAt')}{' '}
              {dateFmt.format(new Date(data.createdAt))}
            </p>
          </div>
        </div>
      </header>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t('detail.trainer')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">{t('detail.trainer')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {data.trainer.name}
            </dd>
            <dd className="font-mono text-[11px] text-slate-500">{data.trainer.email}</dd>
          </div>
          <div>
            <dt className="text-slate-500">
              {data.trainer.emailVerifiedAt
                ? t('detail.verifiedEmail')
                : t('detail.unverifiedEmail')}
            </dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {data.trainer.emailVerifiedAt
                ? dateFmt.format(new Date(data.trainer.emailVerifiedAt))
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('detail.accountAge')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {ageDays >= 1
                ? t('detail.ageDays', { days: ageDays })
                : t('detail.ageHours', { hours: ageHours })}
            </dd>
          </div>
          {data.trainer.trainerProfile?.slug ? (
            <div>
              <dt className="text-slate-500">{t('detail.trainerProfile')}</dt>
              <dd>
                <Link
                  href={`/${locale}/trainers/${data.trainer.trainerProfile.slug}`}
                  className="text-brand-600 hover:text-brand-700"
                >
                  {data.trainer.trainerProfile.headline || data.trainer.trainerProfile.slug}
                </Link>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t('detail.scoring')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">{t('detail.score')}</dt>
            <dd className="font-mono text-base font-semibold text-slate-800 dark:text-slate-200">
              {data.riskScore ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('detail.level')}</dt>
            <dd>
              <RiskBadge level={data.riskLevel} score={null} />
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('detail.computedAt', { at: '' }).trim()}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {data.riskComputedAt
                ? dateFmt.format(new Date(data.riskComputedAt))
                : t('detail.neverComputed')}
            </dd>
          </div>
        </dl>

        <div className="space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="text-xs text-slate-500">{t('detail.flags')}</div>
          {data.riskFlags.length === 0 ? (
            <p className="text-xs text-slate-500">{t('detail.noFlags')}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {data.riskFlags.map((f) => (
                <li
                  key={f}
                  className="inline-flex items-center rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
                >
                  {t(`signal.${f}` as 'signal.DISPOSABLE_EMAIL', {
                    default: f,
                  } as { default: string })}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t('detail.applicationDetails')}
        </h2>
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">{t('detail.proposedRate')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {data.proposedRate ? `$${data.proposedRate}/h` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('detail.proposedTimeline')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {data.proposedTimelineDays
                ? t('detail.days', { days: data.proposedTimelineDays })
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('detail.budget')}</dt>
            <dd className="font-medium text-slate-800 dark:text-slate-200">
              {formatBudget(data.request.budgetMin, data.request.budgetMax)}
            </dd>
          </div>
        </dl>
        <div className="space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="text-xs text-slate-500">{t('detail.coverLetter')}</div>
          {data.coverLetter ? (
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">
              {data.coverLetter}
            </p>
          ) : (
            <p className="text-xs text-slate-500">{t('detail.noCoverLetter')}</p>
          )}
        </div>

        <div className="space-y-1 border-t border-slate-200 pt-3 dark:border-slate-700">
          <div className="text-xs text-slate-500">{t('detail.answers')}</div>
          <AnswersBlock answers={data.answers} emptyLabel={t('detail.noAnswers')} />
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t('detail.review')}
        </h2>
        {data.riskReviewedAt ? (
          <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
            {t('reviewedAt', { at: dateFmt.format(new Date(data.riskReviewedAt)) })}
            {data.riskReviewedBy ? ` — ${t('detail.reviewBy')}: ${data.riskReviewedBy}` : ''}
            {data.riskReviewNote ? (
              <p className="mt-1 whitespace-pre-line">{data.riskReviewNote}</p>
            ) : null}
          </div>
        ) : null}
        <ReviewActions
          applicationId={data.id}
          reviewed={Boolean(data.riskReviewedAt)}
          t={{
            markReviewed: t('actions.markReviewed'),
            rescore: t('actions.rescore'),
            clearReview: t('actions.clearReview'),
            notePlaceholder: t('actions.notePlaceholder'),
          }}
        />
      </section>
    </div>
  );
}

function BackLink({ locale, label }: { locale: string; label: string }) {
  return (
    <div className="text-xs">
      <Link href={`/${locale}/admin/fraud`} className="text-brand-600 hover:text-brand-700">
        ← {label}
      </Link>
    </div>
  );
}

function formatBudget(min: number | null, max: number | null): string {
  if (min == null && max == null) return '—';
  if (min != null && max != null) return `$${min} – $${max}`;
  return `$${min ?? max}`;
}

function AnswersBlock({
  answers,
  emptyLabel,
}: {
  answers: Record<string, unknown> | null;
  emptyLabel: string;
}) {
  if (!answers || Object.keys(answers).length === 0) {
    return <p className="text-xs text-slate-500">{emptyLabel}</p>;
  }
  return (
    <dl className="space-y-2 text-xs">
      {Object.entries(answers).map(([key, value]) => (
        <div key={key}>
          <dt className="font-medium text-slate-600 dark:text-slate-300">{key}</dt>
          <dd className="whitespace-pre-line text-slate-800 dark:text-slate-100">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function RiskBadge({
  level,
  score,
}: {
  level: RiskLevelLiteral | null;
  score: number | null;
}) {
  const color =
    level === 'CRITICAL'
      ? 'bg-rose-600 text-white'
      : level === 'HIGH'
        ? 'bg-rose-500/90 text-white'
        : level === 'MEDIUM'
          ? 'bg-amber-500/90 text-white'
          : level === 'LOW'
            ? 'bg-emerald-500/90 text-white'
            : 'bg-slate-300 text-slate-700';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${color}`}
    >
      {level ?? '—'} {typeof score === 'number' ? `· ${score}` : ''}
    </span>
  );
}
