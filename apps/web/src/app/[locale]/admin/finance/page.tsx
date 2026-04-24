import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCents } from '@/lib/format-money';
import type { AdminFinanceOverview } from '@trainova/shared';

export const dynamic = 'force-dynamic';

export default async function AdminFinanceOverviewPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const data = await authedFetch<AdminFinanceOverview>('/admin/finance/overview');

  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  const cards: Array<{ key: string; label: string; value: string; tone: string }> = [
    {
      key: 'escrowHeld',
      label: t('admin.finance.overview.escrowHeld'),
      value: formatCents(data.totals.escrowHeldCents, 'USD', intlLocale),
      tone: 'from-amber-500/10 to-orange-500/10 text-amber-700',
    },
    {
      key: 'released',
      label: t('admin.finance.overview.released'),
      value: formatCents(data.totals.releasedCents, 'USD', intlLocale),
      tone: 'from-emerald-500/10 to-teal-500/10 text-emerald-700',
    },
    {
      key: 'platformFee',
      label: t('admin.finance.overview.platformFee'),
      value: formatCents(data.totals.platformFeeCents, 'USD', intlLocale),
      tone: 'from-brand-500/10 to-violet-500/10 text-brand-700',
    },
    {
      key: 'refunded',
      label: t('admin.finance.overview.refunded'),
      value: formatCents(data.totals.refundedCents, 'USD', intlLocale),
      tone: 'from-rose-500/10 to-pink-500/10 text-rose-700',
    },
    {
      key: 'payoutsPaid',
      label: t('admin.finance.overview.payoutsPaid'),
      value: formatCents(data.totals.payoutsPaidCents, 'USD', intlLocale),
      tone: 'from-sky-500/10 to-blue-500/10 text-sky-700',
    },
    {
      key: 'payoutsPending',
      label: t('admin.finance.overview.payoutsPending'),
      value: formatCents(data.totals.payoutsPendingCents, 'USD', intlLocale),
      tone: 'from-slate-500/10 to-slate-400/10 text-slate-700',
    },
    {
      key: 'payoutsFailed',
      label: t('admin.finance.overview.payoutsFailed'),
      value: formatCents(data.totals.payoutsFailedCents, 'USD', intlLocale),
      tone: 'from-rose-600/10 to-red-500/10 text-rose-800',
    },
    {
      key: 'activeSubscriptions',
      label: t('admin.finance.overview.activeSubscriptions'),
      value: String(data.totals.activeSubscriptions),
      tone: 'from-indigo-500/10 to-blue-500/10 text-indigo-700',
    },
  ];

  // Compute peak for chart scaling
  const peakGross = Math.max(1, ...data.monthlyRevenue.map((m) => m.grossCents));

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.finance.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.finance.subtitle')}</p>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm">
          <Link
            href={`/${locale}/admin/finance/contracts`}
            className="rounded-lg bg-white/70 px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md transition hover:bg-white"
          >
            {t('admin.finance.tabs.contracts')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/payouts`}
            className="rounded-lg bg-white/70 px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md transition hover:bg-white"
          >
            {t('admin.finance.tabs.payouts')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/subscriptions`}
            className="rounded-lg bg-white/70 px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md transition hover:bg-white"
          >
            {t('admin.finance.tabs.subscriptions')}
          </Link>
          <Link
            href={`/${locale}/admin/finance/plans`}
            className="rounded-lg bg-white/70 px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md transition hover:bg-white"
          >
            {t('admin.finance.tabs.plans')}
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`rounded-2xl bg-gradient-to-br ${c.tone} p-4 ring-1 ring-white/60 backdrop-blur-md`}
          >
            <p className="text-xs font-medium uppercase tracking-wider opacity-80">{c.label}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly bars (gross / fee / refund) */}
      <section className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('admin.finance.overview.monthlyRevenue')}
        </h2>
        <div className="mt-4 grid grid-cols-12 items-end gap-2">
          {data.monthlyRevenue.map((m) => (
            <div key={m.month} className="flex flex-col items-center gap-1">
              <div
                className="flex h-32 w-full flex-col-reverse items-stretch justify-end overflow-hidden rounded-md bg-slate-100"
                title={`${m.month} • gross ${formatCents(m.grossCents, 'USD', intlLocale)} • fee ${formatCents(m.feeCents, 'USD', intlLocale)} • refunds ${formatCents(m.refundCents, 'USD', intlLocale)}`}
              >
                <div
                  className="bg-gradient-to-t from-brand-600 to-brand-400"
                  style={{ height: `${(m.grossCents / peakGross) * 100}%` }}
                />
                <div
                  className="bg-emerald-400/70"
                  style={{ height: `${(m.feeCents / peakGross) * 100}%` }}
                />
                <div
                  className="bg-rose-400/70"
                  style={{ height: `${(m.refundCents / peakGross) * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-medium tabular-nums text-slate-500">
                {m.month.slice(2)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded bg-gradient-to-t from-brand-600 to-brand-400" />
            {t('admin.finance.overview.gross')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded bg-emerald-400/70" />
            {t('admin.finance.overview.fee')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3 rounded bg-rose-400/70" />
            {t('admin.finance.overview.refunds')}
          </span>
        </div>
      </section>

      {/* Recent contracts + payouts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.finance.overview.recentContracts')}
            </h2>
            <Link
              href={`/${locale}/admin/finance/contracts`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {t('admin.finance.viewAll')}
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {data.recent.contracts.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500">
                {t('admin.finance.empty')}
              </li>
            ) : (
              data.recent.contracts.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${locale}/admin/finance/contracts/${c.id}`}
                      className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700"
                    >
                      {c.title}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {c.company.name} · {c.trainer.name}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {formatCents(c.totalAmountCents, c.currency, intlLocale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
          <header className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('admin.finance.overview.recentPayouts')}
            </h2>
            <Link
              href={`/${locale}/admin/finance/payouts`}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {t('admin.finance.viewAll')}
            </Link>
          </header>
          <ul className="divide-y divide-slate-100">
            {data.recent.payouts.length === 0 ? (
              <li className="py-6 text-center text-sm text-slate-500">
                {t('admin.finance.empty')}
              </li>
            ) : (
              data.recent.payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {p.trainer.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {p.milestone?.contractTitle ?? '—'}
                      {' · '}
                      {t(`admin.finance.payoutStatus.${p.status}` as 'admin.finance.payoutStatus.PENDING')}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
                    {formatCents(p.amountCents, p.currency, intlLocale)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
