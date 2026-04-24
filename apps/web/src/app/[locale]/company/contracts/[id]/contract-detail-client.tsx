'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { PublicContract, PublicMilestone } from '@trainova/shared';
import { StripePaymentElement } from '@/components/stripe-payment-element';

interface Props {
  locale: string;
  contract: PublicContract;
  viewer: 'COMPANY' | 'TRAINER';
}

export function ContractDetailClient({ locale, contract, viewer }: Props) {
  const t = useTranslations('contracts');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [fundFor, setFundFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [, startTransition] = useTransition();

  const fmt = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: contract.currency }),
    [locale, contract.currency],
  );

  async function fundMilestone(milestoneId: string, paymentMethodId: string) {
    const res = await fetch(
      `/api/proxy/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(milestoneId)}/fund`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let msg = t('errors.fundFailed');
      try {
        const parsed = JSON.parse(body) as { message?: string };
        if (parsed.message) msg = parsed.message;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    setBanner({ kind: 'success', message: t('fundedOk') });
    setFundFor(null);
    startTransition(() => router.refresh());
  }

  async function releaseMilestone(milestoneId: string) {
    setBanner(null);
    setBusyId(milestoneId);
    try {
      const res = await fetch(
        `/api/proxy/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(milestoneId)}/release`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = t('errors.releaseFailed');
        try {
          const parsed = JSON.parse(body) as { message?: string };
          if (parsed.message) msg = parsed.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setBanner({ kind: 'success', message: t('releasedOk') });
      startTransition(() => router.refresh());
    } catch (err) {
      setBanner({ kind: 'error', message: (err as Error).message ?? tCommon('error') });
    } finally {
      setBusyId(null);
    }
  }

  async function refundMilestone(milestoneId: string) {
    setBanner(null);
    setBusyId(milestoneId);
    const reason = window.prompt(t('refundPrompt')) ?? '';
    try {
      const res = await fetch(
        `/api/proxy/contracts/${encodeURIComponent(contract.id)}/milestones/${encodeURIComponent(milestoneId)}/refund`,
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let msg = t('errors.refundFailed');
        try {
          const parsed = JSON.parse(body) as { message?: string };
          if (parsed.message) msg = parsed.message;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      setBanner({ kind: 'success', message: t('refundedOk') });
      startTransition(() => router.refresh());
    } catch (err) {
      setBanner({ kind: 'error', message: (err as Error).message ?? tCommon('error') });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
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

      <header className="rounded-3xl border border-white/40 bg-gradient-to-br from-brand-50/70 via-white/70 to-indigo-50/60 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/60 dark:to-slate-900/60">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {contract.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('counterparty')}:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {viewer === 'COMPANY'
                  ? (contract.trainer?.name ?? t('trainerUnknown'))
                  : (contract.company?.name ?? t('companyUnknown'))}
              </span>
            </p>
          </div>
          <span
            className="rounded-full border border-brand-300/60 bg-brand-100/70 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
            aria-label={t('statusLabel')}
          >
            {contract.status}
          </span>
        </div>
        {contract.description ? (
          <p className="mt-3 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
            {contract.description}
          </p>
        ) : null}
        <dl className="mt-4 grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('total')}</dt>
            <dd className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {fmt.format(contract.totalAmountCents / 100)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('fee')}</dt>
            <dd className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {(contract.platformFeeBps / 100).toFixed(1)}%
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('currencyLabel')}</dt>
            <dd className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {contract.currency}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500 dark:text-slate-400">{t('createdAt')}</dt>
            <dd className="text-base font-semibold text-slate-900 dark:text-slate-50">
              {new Date(contract.createdAt).toLocaleDateString(locale)}
            </dd>
          </div>
        </dl>
      </header>

      <section aria-labelledby="milestones-heading" className="space-y-4">
        <h2
          id="milestones-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('milestonesTitle')}
        </h2>
        <ol className="space-y-3">
          {contract.milestones.map((m, idx) => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              index={idx + 1}
              fmt={fmt}
              viewer={viewer}
              busy={busyId === m.id}
              isFundingActive={fundFor === m.id}
              onStartFund={() => {
                setBanner(null);
                setFundFor(m.id);
              }}
              onCancelFund={() => setFundFor(null)}
              onFundSubmit={async (pmId) => {
                try {
                  await fundMilestone(m.id, pmId);
                } catch (err) {
                  setBanner({
                    kind: 'error',
                    message: (err as Error).message ?? tCommon('error'),
                  });
                  throw err;
                }
              }}
              onRelease={() => releaseMilestone(m.id)}
              onRefund={() => refundMilestone(m.id)}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

interface MilestoneCardProps {
  milestone: PublicMilestone;
  index: number;
  fmt: Intl.NumberFormat;
  viewer: 'COMPANY' | 'TRAINER';
  busy: boolean;
  isFundingActive: boolean;
  onStartFund: () => void;
  onCancelFund: () => void;
  onFundSubmit: (paymentMethodId: string) => Promise<void>;
  onRelease: () => void;
  onRefund: () => void;
}

function MilestoneCard({
  milestone,
  index,
  fmt,
  viewer,
  busy,
  isFundingActive,
  onStartFund,
  onCancelFund,
  onFundSubmit,
  onRelease,
  onRefund,
}: MilestoneCardProps) {
  const t = useTranslations('contracts');
  const tCommon = useTranslations('common');
  const statusColor: Record<string, string> = {
    PENDING:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
    FUNDED:
      'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
    RELEASED:
      'border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    REFUNDED:
      'border-rose-300 bg-rose-100 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    CANCELLED:
      'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };
  return (
    <li className="rounded-3xl border border-white/40 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t('milestoneNumber', { n: index })}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusColor[milestone.status] ?? statusColor.PENDING}`}
            >
              {milestone.status}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-50">
            {milestone.title}
          </h3>
          {milestone.description ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {milestone.description}
            </p>
          ) : null}
        </div>
        <div className="text-end">
          <p className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {fmt.format(milestone.amountCents / 100)}
          </p>
        </div>
      </div>
      {viewer === 'COMPANY' ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {milestone.status === 'PENDING' && !isFundingActive ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onStartFund}
              disabled={busy}
            >
              {t('fundCta')}
            </button>
          ) : null}
          {milestone.status === 'FUNDED' ? (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={onRelease}
                disabled={busy}
              >
                {t('releaseCta')}
              </button>
              <button
                type="button"
                className="btn-ghost text-rose-600 hover:text-rose-700"
                onClick={onRefund}
                disabled={busy}
              >
                {t('refundCta')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {isFundingActive ? (
        <div className="mt-4">
          <StripePaymentElement
            submitLabel={t('fundConfirmCta')}
            title={t('fundConfirmTitle', { amount: fmt.format(milestone.amountCents / 100) })}
            hint={t('fundConfirmHint')}
            onConfirmed={async (pmId) => {
              await onFundSubmit(pmId);
            }}
          />
          <button
            type="button"
            className="mt-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            onClick={onCancelFund}
            disabled={busy}
          >
            {tCommon('cancel')}
          </button>
        </div>
      ) : null}
    </li>
  );
}
