import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface MeUser {
  name: string;
}
interface ApplicationRow {
  id: string;
  status: string;
  createdAt: string;
  request: {
    id: string;
    slug: string;
    title: string;
    modelFamily: string | null;
    industry: string | null;
    company: { name: string; slug: string };
  };
}

export default async function TrainerDashboard() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const [me, apps] = await Promise.all([
    authedFetch<MeUser>('/auth/me'),
    authedFetch<ApplicationRow[]>('/applications/mine').catch(() => []),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('dashboard.welcome', { name: me.name })}</h1>
        <p className="text-sm text-slate-500">{t('dashboard.trainerOverview')}</p>
      </header>

      <div className="flex gap-3">
        <Link href={`/${locale}/requests`} className="btn-primary">
          {t('common.browseRequests')}
        </Link>
        <Link href={`/${locale}/trainer/profile`} className="btn-secondary">
          {t('profile.trainer.title')}
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('dashboard.myApplications')}</h2>
        {apps.length === 0 ? (
          <div className="card text-sm text-slate-500">You haven&apos;t applied to any requests yet.</div>
        ) : (
          <ul className="space-y-3">
            {apps.map((a) => (
              <li key={a.id} className="card flex items-center justify-between">
                <div>
                  <Link
                    href={`/${locale}/requests/${a.request.slug}`}
                    className="font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {a.request.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {a.request.company.name}
                    {a.request.modelFamily ? ` · ${a.request.modelFamily}` : ''}
                  </div>
                </div>
                <span className="badge">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
