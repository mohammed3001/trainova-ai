import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { ADMIN_ROLE_GROUPS, type SponsoredPlacementList } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { AdminSponsoredClient } from './admin-sponsored-client';

/**
 * T7.G — Sponsored placements admin grid.
 *
 * Server-rendered shell that gates access via `ADMIN_ROLE_GROUPS.ADS`
 * (SUPER_ADMIN / ADMIN / ADS_MANAGER — same group used by the admin
 * nav so any role that sees the sidebar link can also reach this
 * page), seeds the first 25 rows for fast first paint, and hands off
 * to the client island for filter/CRUD interactions. We never trust
 * the seed beyond first paint — the client component reloads after
 * every mutation so `sponsoredUntil` mirrors stay in sync with the
 * latest server state.
 */
export default async function AdminSponsoredPage() {
  const t = await getTranslations('admin.sponsored');
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.ADS as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const initial = await authedFetch<SponsoredPlacementList>(
    '/admin/sponsored?limit=25&offset=0',
  ).catch(() => ({ items: [], total: 0 }) satisfies SponsoredPlacementList);

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
      <AdminSponsoredClient initial={initial} />
    </div>
  );
}
