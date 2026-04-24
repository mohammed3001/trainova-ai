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
          <Link className="btn-ghost" href={`/${locale}/admin/ads`}>
            {t('admin.ads.title')}
          </Link>
        </nav>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.href} data-testid="admin-kpi-card">
            <Link
              href={c.href}
              className="group relative block overflow-hidden rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                aria-hidden
                className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${c.accent}`}
              />
              <div className="relative">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  {c.label}
                </div>
                <div className="mt-2 text-4xl font-bold text-slate-900 tabular-nums">
                  {c.value.toLocaleString()}
                </div>
                {c.sub && <div className="mt-1 text-xs text-slate-500">{c.sub}</div>}
              </div>
            </Link>
          </div>
        ))}
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
