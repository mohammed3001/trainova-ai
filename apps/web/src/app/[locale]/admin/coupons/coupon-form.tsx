'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  CouponAppliesTos,
  CouponAudiences,
  CouponKinds,
  CouponStatuses,
  type PublicCoupon,
} from '@trainova/shared';
import { createCouponAction, updateCouponAction } from './actions';

interface PlanRow {
  id: string;
  audience: 'COMPANY' | 'TRAINER';
  tier: string;
  priceMonthly: number;
}

interface Props {
  mode: 'create' | 'edit';
  plans: PlanRow[];
  coupon?: PublicCoupon;
}

function toLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // <input type="datetime-local"> wants YYYY-MM-DDTHH:mm in local TZ.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CouponForm({ mode, plans, coupon }: Props) {
  const t = useTranslations('admin.coupons');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<'PERCENT' | 'FIXED'>(coupon?.kind ?? 'PERCENT');

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createCouponAction(fd)
          : await updateCouponAction(coupon!.id, fd);
      if (!result.ok) {
        setError(result.error ?? 'Failed');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.code')}</span>
          <input
            name="code"
            defaultValue={coupon?.code}
            required={mode === 'create'}
            disabled={mode === 'edit'}
            placeholder="WELCOME20"
            className="input font-mono uppercase"
            pattern="[A-Z0-9_-]{3,40}"
            maxLength={40}
          />
          <span className="text-xs text-slate-500">{t('field.codeHint')}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.description')}</span>
          <input
            name="description"
            defaultValue={coupon?.description ?? ''}
            placeholder={t('field.descriptionPlaceholder')}
            className="input"
            maxLength={500}
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.kind')}</span>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as 'PERCENT' | 'FIXED')}
            disabled={mode === 'edit'}
            className="input"
          >
            {CouponKinds.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">
            {kind === 'PERCENT' ? t('field.amountOffBps') : t('field.amountOffMinor')}
          </span>
          <input
            name="amountOff"
            type="number"
            min={1}
            max={kind === 'PERCENT' ? 10000 : undefined}
            defaultValue={coupon?.amountOff}
            disabled={mode === 'edit'}
            required={mode === 'create'}
            className="input tabular-nums"
          />
          <span className="text-xs text-slate-500">
            {kind === 'PERCENT' ? t('field.amountOffBpsHint') : t('field.amountOffMinorHint')}
          </span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.currency')}</span>
          <input
            name="currency"
            defaultValue={coupon?.currency ?? ''}
            disabled={mode === 'edit'}
            placeholder={kind === 'FIXED' ? 'USD' : t('field.currencyOptional')}
            className="input uppercase"
            maxLength={3}
            pattern="[A-Za-z]{3}"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.audience')}</span>
          <select
            name="audience"
            defaultValue={coupon?.audience ?? 'ANY'}
            className="input"
          >
            {CouponAudiences.map((a) => (
              <option key={a} value={a}>
                {t(`audience.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.appliesTo')}</span>
          <select
            name="appliesTo"
            defaultValue={coupon?.appliesTo ?? 'ANY'}
            className="input"
          >
            {CouponAppliesTos.map((a) => (
              <option key={a} value={a}>
                {t(`appliesTo.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.perUserLimit')}</span>
          <input
            name="perUserLimit"
            type="number"
            min={1}
            defaultValue={coupon?.perUserLimit ?? 1}
            className="input tabular-nums"
          />
        </label>
      </div>

      <fieldset className="space-y-2 rounded-xl border border-slate-200 p-4">
        <legend className="text-sm font-medium text-slate-700">
          {t('field.planIds')}
        </legend>
        <p className="text-xs text-slate-500">{t('field.planIdsHint')}</p>
        <div className="grid gap-2 md:grid-cols-2">
          {plans.length === 0 && (
            <p className="text-xs text-slate-500">{t('field.planIdsEmpty')}</p>
          )}
          {plans.map((p) => {
            const checked = coupon?.planIds.includes(p.id) ?? false;
            return (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="planIds"
                  value={p.id}
                  defaultChecked={checked}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-mono text-xs">
                  [{p.audience}] {p.tier}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.minAmountMinor')}</span>
          <input
            name="minAmountMinor"
            type="number"
            min={0}
            defaultValue={coupon?.minAmountMinor ?? ''}
            placeholder={t('field.minAmountMinorPlaceholder')}
            className="input tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.maxDiscountMinor')}</span>
          <input
            name="maxDiscountMinor"
            type="number"
            min={0}
            defaultValue={coupon?.maxDiscountMinor ?? ''}
            placeholder={t('field.maxDiscountMinorPlaceholder')}
            className="input tabular-nums"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.validFrom')}</span>
          <input
            name="validFrom"
            type="datetime-local"
            defaultValue={toLocalDateTime(coupon?.validFrom)}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.validUntil')}</span>
          <input
            name="validUntil"
            type="datetime-local"
            defaultValue={toLocalDateTime(coupon?.validUntil)}
            className="input"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.maxRedemptions')}</span>
          <input
            name="maxRedemptions"
            type="number"
            min={1}
            defaultValue={coupon?.maxRedemptions ?? ''}
            placeholder={t('field.maxRedemptionsPlaceholder')}
            className="input tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.stripeCouponId')}</span>
          <input
            name="stripeCouponId"
            defaultValue={coupon?.stripeCouponId ?? ''}
            placeholder="promo_..."
            className="input font-mono"
            maxLength={120}
          />
          <span className="text-xs text-slate-500">{t('field.stripeCouponIdHint')}</span>
        </label>
      </div>

      {mode === 'edit' && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('field.status')}</span>
          <select
            name="status"
            defaultValue={coupon?.status ?? 'ACTIVE'}
            className="input max-w-xs"
          >
            {CouponStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending
            ? t('saving')
            : mode === 'create'
              ? t('create')
              : t('save')}
        </button>
      </div>
    </form>
  );
}
