import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { BillingClient, type BillingPlan, type BillingSubscription } from './billing-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function CompanyBillingPage({ params }: Props) {
  const { locale } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/billing`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const [plans, subscription, t] = await Promise.all([
    authedFetch<BillingPlan[]>('/billing/plans').catch(() => [] as BillingPlan[]),
    authedFetch<BillingSubscription | null>('/billing/subscription').catch(() => null),
    getTranslations({ locale, namespace: 'billing' }),
  ]);

  // Company tiles only (trainer plans live in the trainer app).
  const companyPlans = plans.filter((p) => p.audience === 'COMPANY');

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('companyTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('companySubtitle')}</p>
      </header>
      <BillingClient
        audience="COMPANY"
        locale={locale}
        plans={companyPlans}
        subscription={subscription}
      />
    </div>
  );
}
