import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { isAdminRole, type UserRole } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface Overview {
  users: number;
  usersActive: number;
  usersSuspended: number;
  companies: number;
  companiesVerified: number;
  trainers: number;
  trainersVerified: number;
  requestsOpen: number;
  applications: number;
  pendingVerifications: number;
  generatedAt: string;
}

export default async function AdminDashboard() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!isAdminRole((role ?? null) as UserRole | null)) redirect(`/${locale}`);

  const o = await authedFetch<Overview>('/admin/overview');

  const cards: Array<{
    href: string;
    label: string;
    value: number;
    accent: string;
    sub?: string;
  }> = [
    {
      href: `/${locale}/admin/users`,
      label: t('admin.kpi.users'),
      value: o.users,
      accent: 'from-brand-500/20 to-brand-500/5',
      sub: t('admin.kpi.usersSub', { active: o.usersActive, suspended: o.usersSuspended }),
    },
    {
      href: `/${locale}/admin/companies`,
      label: t('admin.kpi.companies'),
      value: o.companies,
      accent: 'from-sky-500/20 to-sky-500/5',
      sub: t('admin.kpi.verifiedOf', { verified: o.companiesVerified }),
    },
    {
      href: `/${locale}/admin/trainers`,
      label: t('admin.kpi.trainers'),
      value: o.trainers,
      accent: 'from-fuchsia-500/20 to-fuchsia-500/5',
      sub: t('admin.kpi.verifiedOf', { verified: o.trainersVerified }),
    },
    {
      href: `/${locale}/admin/requests`,
      label: t('admin.kpi.requestsOpen'),
      value: o.requestsOpen,
      accent: 'from-emerald-500/20 to-emerald-500/5',
    },
    {
      href: `/${locale}/admin/verification`,
      label: t('admin.kpi.pendingVerifications'),
      value: o.pendingVerifications,
      accent: 'from-amber-500/20 to-amber-500/5',
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.overview')}</h1>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link className="btn-ghost" href={`/${locale}/admin/users`}>
              {t('admin.users')}
            </Link>
            <Link className="btn-ghost" href={`/${locale}/admin/companies`}>
              {t('admin.companies')}
            </Link>
            <Link className="btn-ghost" href={`/${locale}/admin/trainers`}>
              {t('admin.trainers')}
            </Link>
            <Link className="btn-ghost" href={`/${locale}/admin/verification`}>
              {t('admin.verification.title')}
            </Link>
            <Link className="btn-ghost" href={`/${locale}/admin/requests`}>
              {t('admin.requests.title')}
            </Link>
            <Link className="btn-ghost" href={`/${locale}/admin/ads`}>
              {t('admin.ads.title')}
            </Link>
          </nav>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {t('admin.generatedAt')}:{' '}
          <time dateTime={o.generatedAt}>{new Date(o.generatedAt).toLocaleString()}</time>
        </p>
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
