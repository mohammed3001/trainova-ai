import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { ADMIN_ROLE_GROUPS, type PublicCoupon } from '@trainova/shared';
import { CouponForm } from '../coupon-form';
import { DisableCouponButton } from './disable-button';

interface PlanRow {
  id: string;
  audience: 'COMPANY' | 'TRAINER';
  tier: string;
  priceMonthly: number;
}

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function AdminCouponDetailPage({ params }: PageProps) {
  const { id, locale } = await params;
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.FINANCE as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  let coupon: PublicCoupon;
  try {
    coupon = await authedFetch<PublicCoupon>(`/admin/coupons/${id}`);
  } catch {
    notFound();
  }

  let plans: PlanRow[] = [];
  try {
    plans = await authedFetch<PlanRow[]>('/admin/finance/plans');
  } catch {
    plans = [];
  }

  const totalDiscountMajor = (coupon.totalDiscountMinor / 100).toFixed(2);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('admin.coupons.detailEyebrow')}
          </p>
          <h1 className="font-mono text-3xl font-bold text-slate-900">
            {coupon.code}
          </h1>
          {coupon.description && (
            <p className="mt-1 text-sm text-slate-600">{coupon.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/${locale}/admin/coupons`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← {t('admin.coupons.backToList')}
          </Link>
          {coupon.status === 'ACTIVE' && <DisableCouponButton id={coupon.id} />}
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="card bg-gradient-to-br from-indigo-50 to-white">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('admin.coupons.metric.redemptions')}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {coupon.redeemedCount}
            {coupon.maxRedemptions != null && (
              <span className="text-base font-normal text-slate-500">
                {' '}
                / {coupon.maxRedemptions}
              </span>
            )}
          </p>
        </div>
        <div className="card bg-gradient-to-br from-emerald-50 to-white">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('admin.coupons.metric.totalDiscount')}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {totalDiscountMajor} {coupon.currency ?? ''}
          </p>
        </div>
        <div className="card bg-gradient-to-br from-amber-50 to-white">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('admin.coupons.metric.status')}
          </p>
          <p className="mt-2 text-3xl font-bold text-slate-900">
            {t(`admin.coupons.status.${coupon.status}`)}
          </p>
        </div>
      </section>

      <CouponForm mode="edit" plans={plans} coupon={coupon} />
    </div>
  );
}
