import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { DisputeListItem, DisputeStatus } from '@trainova/shared';
import { ADMIN_ROLE_GROUPS, DisputeStatuses } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { DisputeStatusBadgeServer } from '@/components/disputes/dispute-status-badge';

export const dynamic = 'force-dynamic';

interface ListResponse {
  items: DisputeListItem[];
  total: number;
}

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/disputes`);
  if (!(ADMIN_ROLE_GROUPS.MODERATION as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}/dashboard`);
  }
  const sp = await searchParams;
  const status = (DisputeStatuses as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as DisputeStatus)
    : undefined;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const t = await getTranslations({ locale, namespace: 'disputes.admin' });
  const tList = await getTranslations({ locale, namespace: 'disputes.list' });

  const data = await authedFetch<ListResponse>(
    `/admin/disputes?page=${page}&pageSize=20${status ? `&status=${encodeURIComponent(status)}` : ''}`,
  ).catch(() => ({ items: [], total: 0 }));
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{t('title')}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{tList('filterStatus')}:</span>
        <FilterChip
          active={!status}
          label={tList('all')}
          href={`/${locale}/admin/disputes`}
        />
        {DisputeStatuses.map((s) => (
          <StatusFilterChip
            key={s}
            locale={locale}
            active={status === s}
            status={s}
          />
        ))}
      </div>

      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500 dark:text-slate-400">{t('empty')}</div>
      ) : (
        <ul className="space-y-3">
          {data.items.map((d) => (
            <li
              key={d.id}
              className="card flex flex-wrap items-center justify-between gap-3"
              data-testid={`admin-dispute-row-${d.id}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {d.contract.title}
                  </h2>
                  <DisputeStatusBadgeServer status={d.status} locale={locale} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {d.contract.companyName} ↔ {d.contract.trainerName} · {dateFmt.format(new Date(d.raisedAt))}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tList('raisedAt', { at: dateFmt.format(new Date(d.raisedAt)) })} · {d.raisedBy.displayName}
                </p>
              </div>
              <Link href={`/${locale}/admin/disputes/${d.id}`} className="btn-primary text-xs">
                {t('review')}
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
      active={active}
      label={t(status)}
      href={`/${locale}/admin/disputes?status=${status}`}
    />
  );
}
