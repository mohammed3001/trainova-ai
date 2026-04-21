import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface Overview {
  users: number;
  companies: number;
  trainers: number;
  requestsOpen: number;
  applications: number;
  disputes: number;
}

export default async function AdminDashboard() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const o = await authedFetch<Overview>('/admin/overview');

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.overview')}</h1>
        <nav className="flex gap-3 text-sm">
          <Link className="btn-ghost" href={`/${locale}/admin/users`}>
            {t('admin.users')}
          </Link>
          <Link className="btn-ghost" href={`/${locale}/admin/companies`}>
            {t('admin.companies')}
          </Link>
          <Link className="btn-ghost" href={`/${locale}/admin/requests`}>
            {t('admin.requests')}
          </Link>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi label={t('admin.kpi.users')} value={o.users} />
        <Kpi label={t('admin.kpi.companies')} value={o.companies} />
        <Kpi label={t('admin.kpi.trainers')} value={o.trainers} />
        <Kpi label={t('admin.kpi.requestsOpen')} value={o.requestsOpen} />
        <Kpi label={t('admin.kpi.applications')} value={o.applications} />
      </section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-brand-700">{value.toLocaleString()}</div>
    </div>
  );
}
