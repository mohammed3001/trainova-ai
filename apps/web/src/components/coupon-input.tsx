'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

/**
 * T7.E — Coupons & Promotions checkout input.
 *
 * Generic, reusable coupon code input. Used at:
 *   - subscription checkout (`/company/billing` and trainer billing)
 *   - milestone funding (`/company/contracts/[id]`)
 *
 * The component:
 *   1. Renders a "Have a coupon?" disclosure that expands a text input.
 *   2. On Apply, calls `POST /api/proxy/coupons/preview` with the order
 *      `{ code, scope, amountMinor, currency, planId? }`.
 *   3. If valid → shows a success line ("You save X — you'll be charged Y")
 *      and notifies the parent via `onApplied(code, preview)` so the parent
 *      can forward `couponCode` to `/billing/subscribe` or
 *      `/contracts/.../fund`. The backend will re-validate and apply the
 *      discount inside the same Prisma transaction that creates the
 *      Subscription / PaymentIntent + CouponRedemption.
 *   4. If invalid → shows the localised invalid message.
 */

export interface CouponPreview {
  code: string;
  kind: 'PERCENT' | 'FIXED';
  amountOff: number;
  originalMinor: number;
  discountMinor: number;
  finalMinor: number;
  currency: string;
  description: string | null;
}

interface Props {
  scope: 'SUBSCRIPTION' | 'MILESTONE';
  amountMinor: number;
  currency: string;
  /** Optional plan id — required for SUBSCRIPTION coupon plan-eligibility. */
  planId?: string;
  /** Locale for currency formatting. */
  locale: string;
  /** Notify parent when a coupon is applied (or removed with `null`). */
  onApplied: (preview: CouponPreview | null) => void;
  /** Optional disabled gate (e.g. while parent is submitting). */
  disabled?: boolean;
}

export function CouponInput({
  scope,
  amountMinor,
  currency,
  planId,
  locale,
  onApplied,
  disabled,
}: Props) {
  const t = useTranslations('billing.coupon');
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<CouponPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }),
    [locale, currency],
  );

  function apply() {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    startTransition(async () => {
      try {
        const res = await fetch('/api/proxy/coupons/preview', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: trimmed,
            scope,
            amountMinor,
            currency: currency.toUpperCase(),
            ...(planId ? { planId } : {}),
          }),
        });
        if (!res.ok) {
          setError(t('invalid'));
          setApplied(null);
          onApplied(null);
          return;
        }
        const body = (await res.json()) as CouponPreview;
        setApplied(body);
        onApplied(body);
      } catch {
        setError(t('invalid'));
        setApplied(null);
        onApplied(null);
      }
    });
  }

  function remove() {
    setApplied(null);
    setCode('');
    setError(null);
    onApplied(null);
  }

  if (!open && !applied) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 dark:text-brand-300"
      >
        {t('toggle')}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 p-3 backdrop-blur dark:border-white/10 dark:bg-slate-900/50">
      {applied ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <div>
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">
              {t('applied')} · {applied.code}
            </p>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
              {t('discountSummary', {
                discount: formatter.format(applied.discountMinor / 100),
                final: formatter.format(applied.finalMinor / 100),
              })}
            </p>
          </div>
          <button
            type="button"
            onClick={remove}
            disabled={disabled || isPending}
            className="text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50 dark:text-rose-300"
          >
            {t('remove')}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 text-xs font-medium text-slate-600 dark:text-slate-300">
            {t('label')}
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('placeholder')}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled || isPending}
              className="mt-1 block w-full rounded-xl border border-slate-300 bg-white/80 px-3 py-2 text-sm uppercase tracking-wide text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800/70 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            onClick={apply}
            disabled={disabled || isPending || code.trim().length < 3}
            className="btn-secondary text-sm"
          >
            {isPending ? t('applying') : t('apply')}
          </button>
        </div>
      )}
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-300">{error}</p>
      ) : null}
    </div>
  );
}
