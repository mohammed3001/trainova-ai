import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ADMIN_ROLE_GROUPS } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { CampaignSummary } from '../../company/ads/ads-client';
import { AdminAdsClient } from './admin-ads-client';

interface AdminCampaign extends CampaignSummary {
  company: { id: string; slug: string; name: string } | null;
  owner: { id: string; name: string; email: string } | null;
}

export default async function AdminAdsPage() {
  const t = await getTranslations('admin.ads');
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.ADS as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const pending = await authedFetch<AdminCampaign[]>('/admin/ads/pending').catch(
    () => [] as AdminCampaign[],
  );

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          {t('subtitle')}
        </p>
      </header>
      <AdminAdsClient initialPending={pending} locale={locale} />
    </div>
  );
}
