import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { AdsClient, type CampaignSummary } from './ads-client';

/**
 * Self-serve ad campaigns for companies (COMPANY_OWNER only).
 *
 * The list is pre-rendered from the company's own campaigns so the first
 * paint shows current state. All subsequent mutations go through
 * `/api/proxy/ads/...` on the client which keeps the httpOnly session
 * cookie on the server-side fetch.
 */
export default async function CompanyAdsPage() {
  const t = await getTranslations('ads');
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const initial = await authedFetch<CampaignSummary[]>('/ads/campaigns/mine').catch(
    () => [] as CampaignSummary[],
  );

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-100 to-amber-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-700 dark:from-fuchsia-500/10 dark:to-amber-500/10 dark:text-fuchsia-300">
            {t('badge')}
          </span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t('subtitle')}
        </p>
        <p className="max-w-3xl text-xs text-slate-500 dark:text-slate-500">
          {t('disclosure')}
        </p>
      </header>

      <AdsClient initial={initial} locale={locale} />
    </div>
  );
}
