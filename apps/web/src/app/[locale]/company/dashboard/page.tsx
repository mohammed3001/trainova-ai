import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface MeUser {
  id: string;
  email: string;
  name: string;
  role: string;
}
interface RequestRow {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  _count: { applications: number };
}

export default async function CompanyDashboard() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER' && role !== 'COMPANY_MEMBER') redirect(`/${locale}`);

  const [me, requests] = await Promise.all([
    authedFetch<MeUser>('/auth/me'),
    authedFetch<RequestRow[]>('/job-requests/mine').catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('dashboard.welcome', { name: me.name })}</h1>
        <p className="text-sm text-slate-500">{t('dashboard.companyOverview')}</p>
      </header>

      <div className="flex gap-3">
        <Link href={`/${locale}/company/requests/new`} className="btn-primary">
          {t('dashboard.createRequest')}
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('dashboard.myRequests')}</h2>
        {requests.length === 0 ? (
          <div className="card text-sm text-slate-500">No requests yet. Create your first request to start hiring.</div>
        ) : (
          <ul className="space-y-3">
            {requests.map((r) => (
              <li key={r.id} className="card flex items-center justify-between">
                <div>
                  <Link
                    href={`/${locale}/requests/${r.slug}`}
                    className="font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {r.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {r.status} · {t('dashboard.applicationsCount', { count: r._count.applications })}
                  </div>
                </div>
                <Link href={`/${locale}/company/requests/${r.id}/applications`} className="btn-secondary">
                  {t('dashboard.openInDashboard')}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
