import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { StatusBadge, StatusActions } from './status-controls';
import { AssignTestButton } from './assign-test-button';

interface Application {
  id: string;
  status: string;
  coverLetter: string | null;
  proposedRate: number | null;
  proposedTimelineDays: number | null;
  createdAt: string;
  trainer: {
    id: string;
    name: string;
    email: string;
    trainerProfile: {
      slug: string;
      headline: string;
      country: string | null;
      verified: boolean;
      hourlyRateMin: number | null;
      hourlyRateMax: number | null;
    } | null;
  };
}

export default async function ApplicationsPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const apps = await authedFetch<Application[]>(`/job-requests/${id}/applications`).catch(() => []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">{t('company.applications.title')}</h1>
        <Link
          href={`/${locale}/company/requests/${id}/tests`}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          data-testid="manage-tests-link"
        >
          {t('company.applications.manageTests')}
        </Link>
      </div>
      {apps.length === 0 ? (
        <div className="card text-sm text-slate-500">{t('company.applications.empty')}</div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{a.trainer.name}</div>
                  <div className="text-xs text-slate-500">
                    {a.trainer.trainerProfile?.headline}
                    {a.trainer.trainerProfile?.country ? ` · ${a.trainer.trainerProfile.country}` : ''}
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
              {a.coverLetter ? (
                <p className="whitespace-pre-line text-sm text-slate-700">{a.coverLetter}</p>
              ) : null}
              <div className="text-xs text-slate-500">
                {a.proposedRate ? `Proposed: $${a.proposedRate}/h · ` : ''}
                {a.proposedTimelineDays ? `${a.proposedTimelineDays} days` : ''}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusActions applicationId={a.id} currentStatus={a.status} />
                  {a.status === 'APPLIED' || a.status === 'SHORTLISTED' ? (
                    <AssignTestButton applicationId={a.id} requestId={id} />
                  ) : null}
                </div>
                <Link
                  href={`/${locale}/company/requests/${id}/applications/${a.id}`}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  {t('company.applications.viewDetail')}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
