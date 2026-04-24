'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StripePaymentElement } from '@/components/stripe-payment-element';

export interface BillingPlan {
  id: string;
  audience: 'COMPANY' | 'TRAINER';
  tier: string;
  priceMonthly: number;
  priceYearly: number | null;
  features: unknown;
  stripeConfigured: boolean;
}

export interface BillingSubscription {
  id: string;
  planId: string;
  planTier: string | null;
  planAudience: 'COMPANY' | 'TRAINER' | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

interface Props {
  audience: 'COMPANY' | 'TRAINER';
  locale: string;
  plans: BillingPlan[];
  subscription: BillingSubscription | null;
}

export function BillingClient({ audience, locale, plans, subscription }: Props) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [banner, setBanner] = useState<
    | { kind: 'success'; message: string }
    | { kind: 'error'; message: string }
    | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const currentTier = subscription?.planTier ?? null;
  const formatPrice = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    [locale],
  );

  async function subscribe(planId: string, paymentMethodId: string) {
    const res = await fetch('/api/proxy/billing/subscribe', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, paymentMethodId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = t('errors.subscribeFailed');
      try {
        const body = JSON.parse(text) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* ignore */
      }
      throw new Error(message);
    }
    setBanner({ kind: 'success', message: t('subscribedOk') });
    setSelected(null);
    startTransition(() => router.refresh());
  }

  async function cancelCurrent() {
    if (!subscription) return;
    setBanner(null);
    const res = await fetch(
      `/api/proxy/billing/subscriptions/${encodeURIComponent(subscription.id)}`,
      { method: 'DELETE', credentials: 'same-origin' },
    );
    if (!res.ok) {
      setBanner({ kind: 'error', message: t('errors.cancelFailed') });
      return;
    }
    setBanner({ kind: 'success', message: t('cancelledOk') });
    startTransition(() => router.refresh());
  }

  async function openPortal() {
    const res = await fetch('/api/proxy/billing/portal', {
      method: 'POST',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      setBanner({ kind: 'error', message: t('errors.portalFailed') });
      return;
    }
    const body = (await res.json()) as { url: string };
    window.location.href = body.url;
  }

  return (
    <div className="space-y-8">
      {banner ? (
        <div
          className={
            banner.kind === 'success'
              ? 'rounded-2xl border border-emerald-300/60 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800 backdrop-blur dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'rounded-2xl border border-rose-300/60 bg-rose-50/70 px-4 py-3 text-sm text-rose-800 backdrop-blur dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200'
          }
        >
          {banner.message}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/40 bg-gradient-to-br from-brand-50/70 via-white/70 to-indigo-50/60 p-6 shadow-sm backdrop-blur-md dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/60 dark:to-slate-900/60">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {t('currentPlan')}
        </h2>
        {subscription ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {currentTier ?? t('unknownTier')}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('status')}: {subscription.status}
                {subscription.cancelAtPeriodEnd ? ` · ${t('cancelScheduled')}` : ''}
                {subscription.currentPeriodEnd
                  ? ` · ${t('renewsOn')} ${new Date(
                      subscription.currentPeriodEnd,
                    ).toLocaleDateString(locale)}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={openPortal}>
                {t('openPortal')}
              </button>
              {!subscription.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  className="btn-ghost text-rose-600 hover:text-rose-700"
                  onClick={cancelCurrent}
                  disabled={isPending}
                >
                  {t('cancelCta')}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {audience === 'COMPANY' ? t('noActiveCompany') : t('noActiveTrainer')}
          </p>
        )}
      </section>

      <section aria-labelledby="plans-heading">
        <h2
          id="plans-heading"
          className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          {t('availablePlans')}
        </h2>
        {plans.length === 0 ? (
          <p className="rounded-2xl border border-white/40 bg-white/70 p-5 text-sm text-slate-500 backdrop-blur dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-400">
            {t('noPlansYet')}
          </p>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const isCurrent = subscription?.planId === plan.id;
              const canSubscribe = plan.stripeConfigured && !isCurrent;
              return (
                <li
                  key={plan.id}
                  className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/40 bg-white/70 p-6 shadow-sm backdrop-blur-md transition hover:shadow-md dark:border-white/10 dark:bg-slate-900/60"
                >
                  <div className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-brand-200/0 via-brand-200/0 to-indigo-200/0 opacity-0 transition-opacity group-hover:from-brand-200/40 group-hover:via-white/20 group-hover:to-indigo-200/40 group-hover:opacity-100 dark:group-hover:from-brand-500/20 dark:group-hover:via-white/5 dark:group-hover:to-indigo-500/20" />
                  <div className="relative flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-50">
                        {plan.tier}
                      </h3>
                      {isCurrent ? (
                        <span className="rounded-full border border-emerald-300/60 bg-emerald-100/70 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                          {t('currentBadge')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-50">
                      {plan.priceMonthly > 0
                        ? formatPrice.format(plan.priceMonthly / 100)
                        : t('free')}
                      {plan.priceMonthly > 0 ? (
                        <span className="ms-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                          / {t('perMonth')}
                        </span>
                      ) : null}
                    </p>
                    <PlanFeatures features={plan.features} />
                    <div className="mt-5 flex-1" />
                    {!plan.stripeConfigured ? (
                      <p className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                        {t('notConfigured')}
                      </p>
                    ) : canSubscribe ? (
                      <button
                        type="button"
                        className="btn-primary w-full"
                        onClick={() => setSelected(plan.id)}
                      >
                        {t('selectCta')}
                      </button>
                    ) : null}
                    {selected === plan.id ? (
                      <div className="mt-4">
                        <StripePaymentElement
                          submitLabel={t('confirmCta')}
                          title={t('confirmTitle', { tier: plan.tier })}
                          hint={t('confirmHint')}
                          onConfirmed={async (pmId) => {
                            try {
                              await subscribe(plan.id, pmId);
                            } catch (err) {
                              setBanner({
                                kind: 'error',
                                message: (err as Error).message ?? tCommon('error'),
                              });
                              throw err;
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="mt-2 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          onClick={() => setSelected(null)}
                        >
                          {tCommon('cancel')}
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function PlanFeatures({ features }: { features: unknown }) {
  if (!features || typeof features !== 'object') return null;
  const entries = Object.entries(features as Record<string, unknown>);
  if (entries.length === 0) return null;
  return (
    <ul className="mt-4 space-y-1 text-sm text-slate-600 dark:text-slate-300">
      {entries.map(([k, v]) => (
        <li key={k} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-500/80" aria-hidden />
          <span className="font-medium text-slate-700 dark:text-slate-200">{k}</span>
          <span className="text-slate-500 dark:text-slate-400">
            {formatFeatureValue(v)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function formatFeatureValue(v: unknown): string {
  if (v === true) return '✓';
  if (v === false) return '—';
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number' || typeof v === 'string') return String(v);
  return JSON.stringify(v);
}
