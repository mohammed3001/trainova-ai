import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { StatusBadge, StatusActions } from '../status-controls';
import { AssignTestButton } from '../assign-test-button';
import { AttemptsCard } from './attempts-card';

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

interface HistoryRow {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorId: string | null;
  actorName: string | null;
  createdAt: string;
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string; appId: string; locale: string }>;
}) {
  const { id, appId } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  // The company-owned applications list endpoint already enforces ownership
  // and returns the full row we need, so we reuse it and pick ours out.
  const [apps, history] = await Promise.all([
    authedFetch<Application[]>(`/job-requests/${id}/applications`).catch(() => [] as Application[]),
    authedFetch<HistoryRow[]>(`/applications/${appId}/history`).catch(() => [] as HistoryRow[]),
  ]);
  const app = apps.find((a) => a.id === appId);
  if (!app) redirect(`/${locale}/company/requests/${id}/applications`);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-xs">
        <Link
          href={`/${locale}/company/requests/${id}/applications`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {t('company.applications.backToList')}
        </Link>
      </div>
      <header className="card space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{app.trainer.name}</h1>
            <div className="text-xs text-slate-500">
              {app.trainer.trainerProfile?.headline}
              {app.trainer.trainerProfile?.country ? ` · ${app.trainer.trainerProfile.country}` : ''}
            </div>
          </div>
          <StatusBadge status={app.status} />
        </div>
        {app.coverLetter ? (
          <p className="whitespace-pre-line text-sm text-slate-700">{app.coverLetter}</p>
        ) : null}
        <div className="text-xs text-slate-500">
          {app.proposedRate ? `Proposed: $${app.proposedRate}/h · ` : ''}
          {app.proposedTimelineDays ? `${app.proposedTimelineDays} days` : ''}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <StatusActions applicationId={app.id} currentStatus={app.status} />
          {app.status === 'APPLIED' || app.status === 'SHORTLISTED' ? (
            <AssignTestButton applicationId={app.id} requestId={id} />
          ) : null}
        </div>
      </header>

      <AttemptsCard applicationId={appId} requestId={id} locale={locale} />

      <section className="card space-y-3" data-testid="application-history">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('company.applications.history.title')}
        </h2>
        {history.length === 0 ? (
          <div className="text-sm text-slate-500">{t('company.applications.history.empty')}</div>
        ) : (
          <ol className="space-y-3">
            {history.map((row) => (
              <li key={row.id} className="border-l-2 border-slate-200 pl-3">
                <div className="text-sm text-slate-800">
                  <span className="font-medium">{row.actorName ?? t('company.applications.history.unknownActor')}</span>{' '}
                  <span className="text-slate-600">
                    {t('company.applications.history.changedStatus', {
                      from: row.fromStatus ?? '—',
                      to: row.toStatus ?? '—',
                    })}
                  </span>
                </div>
                <div className="text-xs text-slate-500">
                  {new Date(row.createdAt).toLocaleString(locale)}
                </div>
                {row.note ? (
                  <p className="mt-1 whitespace-pre-line rounded bg-slate-50 p-2 text-xs text-slate-700">
                    {row.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
