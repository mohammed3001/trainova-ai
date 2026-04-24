import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import type { AdminSubscriptionRow } from '@trainova/shared';
import { CancelSubscriptionForm } from './cancel-form';

export const dynamic = 'force-dynamic';

interface PageData {
  items: AdminSubscriptionRow[];
  nextCursor: string | null;
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}

const SUB_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'UNPAID',
  'INCOMPLETE',
  'PAUSED',
] as const;

export default async function AdminSubscriptionsListPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.status) qs.set('status', sp.status);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const data = await authedFetch<PageData>(`/admin/finance/subscriptions?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.finance.subscriptions.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.finance.subscriptions.subtitle')}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/finance`}
          className="rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md hover:bg-white"
        >
          ← {t('admin.finance.title')}
        </Link>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.finance.subscriptions.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.finance.filter.allStatuses')}</option>
          {SUB_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          {t('admin.finance.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.finance.subscriptions.col.user')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.subscriptions.col.plan')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.subscriptions.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.subscriptions.col.period')}</th>
              <th className="px-4 py-3 text-end">{t('admin.finance.subscriptions.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.finance.empty')}
                </td>
              </tr>
            ) : (
              data.items.map((s) => (
                <tr key={s.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.user.name}</p>
                    <p className="text-xs text-slate-500">{s.user.email} · {s.user.role}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <span className="font-medium">{s.plan.tier}</span>
                    <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {s.plan.audience}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (s.status === 'ACTIVE' || s.status === 'TRIALING'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'PAST_DUE' || s.status === 'UNPAID'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-700')
                      }
                    >
                      {s.status}
                    </span>
                    {s.cancelAtPeriodEnd ? (
                      <p className="mt-1 text-[11px] font-medium text-amber-700">
                        {t('admin.finance.subscriptions.cancelAtPeriodEnd')}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                    {s.currentPeriodStart && s.currentPeriodEnd ? (
                      <>
                        {new Date(s.currentPeriodStart).toLocaleDateString(intlLocale)}
                        {' → '}
                        {new Date(s.currentPeriodEnd).toLocaleDateString(intlLocale)}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    {s.status !== 'CANCELED' ? (
                      <CancelSubscriptionForm subscriptionId={s.id} />
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.nextCursor ? (
        <div className="flex justify-end">
          <Link
            href={`?${new URLSearchParams({ ...sp, cursor: data.nextCursor }).toString()}`}
            className="rounded-lg bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md hover:bg-white"
          >
            {t('admin.finance.next')} →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
