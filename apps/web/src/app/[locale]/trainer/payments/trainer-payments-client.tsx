'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type {
  PublicContract,
  PublicPayout,
  PublicStripeConnectAccount,
  TrainerEarningsSummary,
} from '@trainova/shared';
import { BillingClient, type BillingPlan, type BillingSubscription } from '../../company/billing/billing-client';

interface Props {
  locale: string;
  connect: PublicStripeConnectAccount | null;
  earnings: TrainerEarningsSummary;
  payouts: PublicPayout[];
  contracts: PublicContract[];
  plans: BillingPlan[];
  subscription: BillingSubscription | null;
}

export function TrainerPaymentsClient({
  locale,
  connect,
  earnings,
  payouts,
  contracts,
  plans,
  subscription,
}: Props) {
  const t = useTranslations('payments');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [, startTransition] = useTransition();

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: (earnings.currency || 'USD').toUpperCase(),
      }),
    [locale, earnings.currency],
  );

  async function onboardConnect() {
    setBanner(null);
    setBusy(true);
    try {
      const res = await fetch('/api/proxy/trainer/payments/connect/onboard', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(t('errors.onboardFailed'));
      const body = (await res.json()) as { onboardingUrl: string };
      window.location.href = body.onboardingUrl;
    } catch (err) {
      setBanner({ kind: 'error', message: (err as Error).message ?? tCommon('error') });
      setBusy(false);
    }
  }

  async function refreshConnect() {
    setBanner(null);
    setBusy(true);
    try {
      const res = await fetch('/api/proxy/trainer/payments/connect/refresh', {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(t('errors.refreshFailed'));
      setBanner({ kind: 'success', message: t('refreshedOk') });
      startTransition(() => router.refresh());
    } catch (err) {
      setBanner({ kind: 'error', message: (err as Error).message ?? tCommon('error') });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {banner ? (
        <div
          role="status"
          className={
            banner.kind === 'success'
              ? 'rounded-2xl border border-emerald-300/60 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 backdrop-blur dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'rounded-2xl border border-rose-300/60 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 backdrop-blur dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200'
          }
        >
          {banner.message}
        </div>
      ) : null}

      <section
        aria-labelledby="earnings-heading"
        className="rounded-3xl border border-white/40 bg-gradient-to-br from-brand-50/70 via-white/70 to-indigo-50/60 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/60 dark:to-slate-900/60"
      >
        <h2
          id="earnings-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('earningsTitle')}
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <EarningsStat label={t('pending')} value={fmt.format(earnings.pendingCents / 100)} />
          <EarningsStat
            label={t('available')}
            value={fmt.format(earnings.availableCents / 100)}
          />
          <EarningsStat label={t('paidOut')} value={fmt.format(earnings.paidOutCents / 100)} />
          <EarningsStat
            label={t('totalEarned')}
            value={fmt.format(earnings.totalEarnedCents / 100)}
          />
        </dl>
      </section>

      <section
        aria-labelledby="connect-heading"
        className="rounded-3xl border border-white/40 bg-white/70 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="connect-heading"
              className="text-lg font-semibold text-slate-900 dark:text-slate-100"
            >
              {t('connectTitle')}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t('connectSubtitle')}
            </p>
          </div>
          <ConnectStatusBadge status={connect?.status ?? 'NONE'} />
        </div>
        {connect ? (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <Meta label={t('chargesEnabled')} value={connect.chargesEnabled ? t('yes') : t('no')} />
            <Meta label={t('payoutsEnabled')} value={connect.payoutsEnabled ? t('yes') : t('no')} />
            <Meta
              label={t('detailsSubmitted')}
              value={connect.detailsSubmitted ? t('yes') : t('no')}
            />
            <Meta label={t('country')} value={connect.country ?? '—'} />
          </dl>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {!connect || connect.status !== 'ACTIVE' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onboardConnect}
              disabled={busy}
            >
              {connect ? t('resumeOnboardCta') : t('startOnboardCta')}
            </button>
          ) : null}
          {connect ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={refreshConnect}
              disabled={busy}
            >
              {t('refreshStatusCta')}
            </button>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="contracts-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="contracts-heading"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {t('contractsTitle')}
          </h2>
          <Link
            href={`/${locale}/trainer/dashboard`}
            className="text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            {t('viewDashboard')} →
          </Link>
        </div>
        {contracts.length === 0 ? (
          <p className="rounded-2xl border border-white/40 bg-white/70 p-5 text-sm text-slate-500 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
            {t('contractsEmpty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {contracts.map((c) => (
              <li
                key={c.id}
                className="rounded-2xl border border-white/40 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                      {c.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {c.company?.name ?? t('companyUnknown')} · {c.status}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                    {new Intl.NumberFormat(locale, {
                      style: 'currency',
                      currency: c.currency,
                    }).format(c.totalAmountCents / 100)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="payouts-heading" className="space-y-3">
        <h2
          id="payouts-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('payoutsTitle')}
        </h2>
        {payouts.length === 0 ? (
          <p className="rounded-2xl border border-white/40 bg-white/70 p-5 text-sm text-slate-500 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
            {t('payoutsEmpty')}
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/70 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/60">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/40 bg-white/40 text-start text-xs uppercase tracking-wide text-slate-500 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400">
                  <th className="px-4 py-2 text-start font-medium">{t('payoutDate')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('payoutAmount')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('payoutStatus')}</th>
                  <th className="px-4 py-2 text-start font-medium">{t('payoutArrived')}</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-white/30 last:border-b-0 dark:border-white/5"
                  >
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                      {new Date(p.createdAt).toLocaleDateString(locale)}
                    </td>
                    <td className="px-4 py-2 font-semibold text-slate-900 dark:text-slate-50">
                      {new Intl.NumberFormat(locale, {
                        style: 'currency',
                        currency: p.currency.toUpperCase(),
                      }).format(p.amountCents / 100)}
                    </td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                      {p.status}
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {p.arrivedAt
                        ? new Date(p.arrivedAt).toLocaleDateString(locale)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="plans-heading-trainer">
        <h2
          id="plans-heading-trainer"
          className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('plansTitle')}
        </h2>
        <BillingClient
          audience="TRAINER"
          locale={locale}
          plans={plans}
          subscription={subscription}
        />
      </section>
    </div>
  );
}

function EarningsStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-50">{value}</dd>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900 dark:text-slate-50">{value}</dd>
    </div>
  );
}

function ConnectStatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    NONE: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
    PENDING:
      'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    ACTIVE:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    RESTRICTED:
      'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    REJECTED:
      'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
  };
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${classes[status] ?? classes.NONE}`}
    >
      {status}
    </span>
  );
}
