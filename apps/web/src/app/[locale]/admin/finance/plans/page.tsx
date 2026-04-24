import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCents } from '@/lib/format-money';
import type { AdminPlanRow } from '@trainova/shared';
import { PlansClient } from './plans-client';

export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  const plans = await authedFetch<AdminPlanRow[]>('/admin/finance/plans');

  const company = plans.filter((p) => p.audience === 'COMPANY');
  const trainer = plans.filter((p) => p.audience === 'TRAINER');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.finance.plans.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.finance.plans.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/finance`}
          className="rounded-lg bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 backdrop-blur-md hover:bg-white"
        >
          ← {t('admin.finance.title')}
        </Link>
      </header>

      <PlansClient
        plans={plans}
        groups={{ COMPANY: company, TRAINER: trainer }}
        labels={{
          createTitle: t('admin.finance.plans.createTitle'),
          editTitle: t('admin.finance.plans.editTitle'),
          audience: t('admin.finance.plans.col.audience'),
          tier: t('admin.finance.plans.col.tier'),
          monthly: t('admin.finance.plans.col.monthly'),
          yearly: t('admin.finance.plans.col.yearly'),
          subs: t('admin.finance.plans.col.subs'),
          actions: t('admin.finance.plans.col.actions'),
          stripePriceId: t('admin.finance.plans.col.stripePriceId'),
          features: t('admin.finance.plans.col.features'),
          create: t('admin.finance.plans.create'),
          edit: t('admin.finance.plans.edit'),
          remove: t('admin.finance.plans.remove'),
          deleteConfirm: t('admin.finance.plans.deleteConfirm'),
          companyHeader: t('admin.finance.plans.companyHeader'),
          trainerHeader: t('admin.finance.plans.trainerHeader'),
          empty: t('admin.finance.empty'),
          dismiss: t('admin.finance.subscriptions.dismiss'),
          save: t('admin.finance.plans.save'),
        }}
        formatMonthly={(cents) => formatCents(cents, 'USD', intlLocale)}
      />
    </div>
  );
}
