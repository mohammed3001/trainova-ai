import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCents } from '@/lib/format-money';
import { PAYOUT_STATUSES, type AdminPayoutRow } from '@trainova/shared';
import { PayoutActions } from './payout-actions';

export const dynamic = 'force-dynamic';

interface PageData {
  items: AdminPayoutRow[];
  nextCursor: string | null;
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}

export default async function AdminPayoutsListPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.status) qs.set('status', sp.status);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const data = await authedFetch<PageData>(`/admin/finance/payouts?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.finance.payouts.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.finance.payouts.subtitle')}</p>
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
          placeholder={t('admin.finance.payouts.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.finance.filter.allStatuses')}</option>
          {PAYOUT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.finance.payoutStatus.${s}` as 'admin.finance.payoutStatus.PENDING')}
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
              <th className="px-4 py-3 text-start">{t('admin.finance.payouts.col.trainer')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.payouts.col.contract')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.payouts.col.amount')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.payouts.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.finance.payouts.col.created')}</th>
              <th className="px-4 py-3 text-end">{t('admin.finance.payouts.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.finance.empty')}
                </td>
              </tr>
            ) : (
              data.items.map((p) => (
                <tr key={p.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{p.trainer.name}</p>
                    <p className="text-xs text-slate-500">{p.trainer.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {p.milestone ? (
                      <Link
                        href={`/${locale}/admin/finance/contracts/${p.milestone.contractId}`}
                        className="hover:underline"
                      >
                        {p.milestone.contractTitle}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                    {formatCents(p.amountCents, p.currency, intlLocale)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-xs font-medium ' +
                        (p.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'FAILED'
                            ? 'bg-rose-100 text-rose-800'
                            : p.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700')
                      }
                    >
                      {t(`admin.finance.payoutStatus.${p.status}` as 'admin.finance.payoutStatus.PENDING')}
                    </span>
                    {p.failureMessage ? (
                      <p className="mt-1 text-[11px] text-rose-700" title={p.failureMessage}>
                        {p.failureMessage.length > 60
                          ? p.failureMessage.slice(0, 57) + '…'
                          : p.failureMessage}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 tabular-nums">
                    {new Date(p.createdAt).toLocaleDateString(intlLocale)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <PayoutActions payoutId={p.id} status={p.status} />
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
