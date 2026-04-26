import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ADMIN_ROLE_GROUPS, RiskLevels, type RiskLevelLiteral } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ReviewActions } from './review-actions';

export const dynamic = 'force-dynamic';

type FraudListItem = {
  id: string;
  status: string;
  createdAt: string;
  riskScore: number | null;
  riskLevel: RiskLevelLiteral | null;
  riskFlags: string[];
  riskComputedAt: string | null;
  riskReviewedAt: string | null;
  riskReviewedBy: string | null;
  riskReviewNote: string | null;
  trainer: { id: string; name: string; email: string };
  request: {
    id: string;
    slug: string;
    title: string;
    company: { name: string; slug: string };
  };
};

type ListResponse = {
  items: FraudListItem[];
  nextCursor: string | null;
};

export default async function AdminFraudPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string; reviewed?: string; cursor?: string }>;
}) {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/fraud`);
  if (!(ADMIN_ROLE_GROUPS.MODERATION as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}/dashboard`);
  }
  const t = await getTranslations({ locale, namespace: 'admin.fraud' });
  const sp = await searchParams;
  const level = (RiskLevels as readonly string[]).includes(sp.level ?? '')
    ? (sp.level as RiskLevelLiteral)
    : undefined;
  const showReviewed = sp.reviewed === 'all';

  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (showReviewed) params.set('onlyUnreviewed', 'false');
  if (sp.cursor) params.set('cursor', sp.cursor);
  params.set('limit', '50');

  const data = await authedFetch<ListResponse>(
    `/admin/fraud/applications?${params.toString()}`,
  ).catch(() => ({ items: [], nextCursor: null }));

  const dateFmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{t('title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{t('filters.level')}:</span>
        <FilterChip
          active={!level}
          label={t('filters.all')}
          href={buildUrl(locale, { reviewed: showReviewed ? 'all' : undefined })}
        />
        {RiskLevels.map((lv) => (
          <FilterChip
            key={lv}
            active={level === lv}
            label={t(`level.${lv.toLowerCase()}` as 'level.low' | 'level.medium' | 'level.high' | 'level.critical')}
            href={buildUrl(locale, { level: lv, reviewed: showReviewed ? 'all' : undefined })}
          />
        ))}
        <span className="ms-4 text-slate-500">{t('filters.reviewed')}:</span>
        <FilterChip
          active={!showReviewed}
          label={t('filters.openOnly')}
          href={buildUrl(locale, { level })}
        />
        <FilterChip
          active={showReviewed}
          label={t('filters.includeReviewed')}
          href={buildUrl(locale, { level, reviewed: 'all' })}
        />
      </div>

      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500 dark:text-slate-400">{t('empty')}</div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((it) => (
            <li
              key={it.id}
              className="card space-y-3"
              data-testid={`admin-fraud-row-${it.id}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <RiskBadge level={it.riskLevel} score={it.riskScore} />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {it.request.title}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {it.request.company.name} · {t('appliedAt')}{' '}
                    {dateFmt.format(new Date(it.createdAt))}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    {it.trainer.name} ·{' '}
                    <span className="font-mono">{it.trainer.email}</span>
                  </p>
                </div>
                <Link
                  href={`/${locale}/company/requests/${it.request.id}/applications/${it.id}`}
                  className="btn-secondary text-xs"
                >
                  {t('open')}
                </Link>
              </div>

              {it.riskFlags.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {it.riskFlags.map((f) => (
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

              {it.riskReviewedAt ? (
                <div className="rounded-md bg-emerald-50 p-2 text-xs text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
                  {t('reviewedAt', { at: dateFmt.format(new Date(it.riskReviewedAt)) })}
                  {it.riskReviewNote ? ` — ${it.riskReviewNote}` : ''}
                </div>
              ) : null}

              <ReviewActions
                applicationId={it.id}
                reviewed={Boolean(it.riskReviewedAt)}
                t={{
                  markReviewed: t('actions.markReviewed'),
                  rescore: t('actions.rescore'),
                  clearReview: t('actions.clearReview'),
                  notePlaceholder: t('actions.notePlaceholder'),
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={buildUrl(locale, {
              level,
              reviewed: showReviewed ? 'all' : undefined,
              cursor: data.nextCursor,
            })}
            className="btn-secondary text-xs"
          >
            {t('loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function buildUrl(
  locale: string,
  params: { level?: string; reviewed?: string; cursor?: string },
): string {
  const sp = new URLSearchParams();
  if (params.level) sp.set('level', params.level);
  if (params.reviewed) sp.set('reviewed', params.reviewed);
  if (params.cursor) sp.set('cursor', params.cursor);
  const q = sp.toString();
  return `/${locale}/admin/fraud${q ? `?${q}` : ''}`;
}

function FilterChip({
  active,
  label,
  href,
}: {
  active: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? 'inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-white dark:bg-slate-100 dark:text-slate-900'
          : 'inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
      }
    >
      {label}
    </Link>
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
