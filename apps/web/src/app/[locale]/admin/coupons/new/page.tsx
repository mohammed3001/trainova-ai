import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { ADMIN_ROLE_GROUPS } from '@trainova/shared';
import { CouponForm } from '../coupon-form';

interface PlanRow {
  id: string;
  audience: 'COMPANY' | 'TRAINER';
  tier: string;
  priceMonthly: number;
}

export default async function NewCouponPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.FINANCE as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  let plans: PlanRow[] = [];
  try {
    plans = await authedFetch<PlanRow[]>('/admin/finance/plans');
  } catch {
    plans = [];
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.coupons.newTitle')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('admin.coupons.newSubtitle')}
        </p>
      </header>
      <CouponForm mode="create" plans={plans} />
    </div>
  );
}
