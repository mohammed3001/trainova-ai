import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

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
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const apps = await authedFetch<Application[]>(`/job-requests/${id}/applications`).catch(() => []);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Applications</h1>
      {apps.length === 0 ? (
        <div className="card text-sm text-slate-500">No applications yet.</div>
      ) : (
        <ul className="space-y-3">
          {apps.map((a) => (
            <li key={a.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{a.trainer.name}</div>
                  <div className="text-xs text-slate-500">
                    {a.trainer.trainerProfile?.headline}
                    {a.trainer.trainerProfile?.country ? ` · ${a.trainer.trainerProfile.country}` : ''}
                  </div>
                </div>
                <span className="badge">{a.status}</span>
              </div>
              {a.coverLetter ? (
                <p className="mt-3 whitespace-pre-line text-sm text-slate-700">{a.coverLetter}</p>
              ) : null}
              <div className="mt-2 text-xs text-slate-500">
                {a.proposedRate ? `Proposed: $${a.proposedRate}/h · ` : ''}
                {a.proposedTimelineDays ? `${a.proposedTimelineDays} days` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
