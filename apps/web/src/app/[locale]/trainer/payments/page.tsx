import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type {
  PublicContract,
  PublicPayout,
  PublicStripeConnectAccount,
  TrainerEarningsSummary,
} from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { TrainerPaymentsClient } from './trainer-payments-client';
import type { BillingPlan, BillingSubscription } from '../../company/billing/billing-client';

export default async function TrainerPaymentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/trainer/payments`);
  if (role !== 'TRAINER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const [connect, earnings, payouts, contracts, plans, subscription, t] =
    await Promise.all([
      authedFetch<PublicStripeConnectAccount | null>('/trainer/payments/connect').catch(
        () => null,
      ),
      authedFetch<TrainerEarningsSummary>('/trainer/payments/earnings').catch(
        () =>
          ({
            currency: 'USD',
            pendingCents: 0,
            availableCents: 0,
            paidOutCents: 0,
            totalEarnedCents: 0,
          }) satisfies TrainerEarningsSummary,
      ),
      authedFetch<PublicPayout[]>('/trainer/payments/payouts').catch(
        () => [] as PublicPayout[],
      ),
      authedFetch<PublicContract[]>('/contracts/mine/trainer').catch(
        () => [] as PublicContract[],
      ),
      authedFetch<BillingPlan[]>('/billing/plans').catch(() => [] as BillingPlan[]),
      authedFetch<BillingSubscription | null>('/billing/subscription').catch(() => null),
      getTranslations({ locale, namespace: 'payments' }),
    ]);

  const trainerPlans = plans.filter((p) => p.audience === 'TRAINER');

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('trainerTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('trainerSubtitle')}</p>
      </header>
      <TrainerPaymentsClient
        locale={locale}
        connect={connect}
        earnings={earnings}
        payouts={payouts}
        contracts={contracts}
        plans={trainerPlans}
        subscription={subscription}
      />
    </div>
  );
}
