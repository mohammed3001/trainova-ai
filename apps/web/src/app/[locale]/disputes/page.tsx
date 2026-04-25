import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { DisputeListItem, DisputeStatus } from '@trainova/shared';
import { DisputeStatuses } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { DisputeStatusBadgeServer } from '@/components/disputes/dispute-status-badge';

export const dynamic = 'force-dynamic';

interface ListResponse {
  items: DisputeListItem[];
  total: number;
}

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/disputes`);
  if (role !== 'TRAINER' && role !== 'COMPANY_OWNER') {
    redirect(`/${locale}/dashboard`);
  }
  const sp = await searchParams;
  const status = (DisputeStatuses as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as DisputeStatus)
    : undefined;
  const t = await getTranslations({ locale, namespace: 'disputes.list' });

  const data = await authedFetch<ListResponse>(
    `/disputes/mine${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  ).catch(() => ({ items: [], total: 0 }));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          {t('title')}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{t('filterStatus')}:</span>
        <FilterChip locale={locale} active={!status} label={t('all')} href={`/${locale}/disputes`} />
        {DisputeStatuses.map((s) => (
          <StatusFilterChip key={s} locale={locale} active={status === s} status={s} />
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500 dark:text-slate-400">{t('empty')}</div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li key={d.id} className="card flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {d.contract.title}
                  </h2>
                  <DisputeStatusBadgeServer status={d.status} locale={locale} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t('raisedAt', { at: dateFmt.format(new Date(d.raisedAt)) })} · {d.raisedBy.displayName}
                </p>
                {d.resolvedAt ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('resolvedAt', { at: dateFmt.format(new Date(d.resolvedAt)) })}
                  </p>
                ) : null}
              </div>
              <Link
                href={`/${locale}/disputes/${d.id}`}
                className="btn-ghost text-xs"
                data-testid={`dispute-view-${d.id}`}
              >
                {t('view')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  href,
}: {
  active: boolean;
  label: string;
  href: string;
  locale: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active
          ? 'border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-400/40 dark:bg-brand-500/10 dark:text-brand-200'
          : 'border-slate-200 bg-white/60 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300'
      }`}
    >
      {label}
    </Link>
  );
}

async function StatusFilterChip({
  locale,
  active,
  status,
}: {
  locale: string;
  active: boolean;
  status: DisputeStatus;
}) {
  const t = await getTranslations({ locale, namespace: 'disputes.status' });
  return (
    <FilterChip
      locale={locale}
      active={active}
      label={t(status)}
      href={`/${locale}/disputes?status=${status}`}
    />
  );
}
