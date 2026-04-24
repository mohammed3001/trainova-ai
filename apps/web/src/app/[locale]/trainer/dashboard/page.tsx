import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { JobMatch } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { StartChatButton } from '@/components/chat/start-chat-button';

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
    modelConnectionId?: string | null;
    company: { name: string; slug: string; ownerId: string };
  };
}

const WORKBENCH_ACCESS_STATUSES = new Set([
  'SHORTLISTED',
  'TEST_ASSIGNED',
  'TEST_SUBMITTED',
  'INTERVIEW',
  'OFFERED',
  'ACCEPTED',
]);

export default async function TrainerDashboard() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const [me, apps, matches] = await Promise.all([
    authedFetch<MeUser>('/auth/me'),
    authedFetch<ApplicationRow[]>('/applications/mine').catch(() => []),
    authedFetch<JobMatch[]>('/matching/me/recommended-jobs?limit=3').catch(
      () => [] as JobMatch[],
    ),
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

      {matches.length > 0 ? (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('matching.trainer.dashboardHeading')}
            </h2>
            <Link
              href={`/${locale}/trainer/recommended`}
              className="text-sm font-medium text-brand-700 hover:text-brand-800"
              data-testid="trainer-matches-see-all"
            >
              {t('matching.trainer.seeAll')}
            </Link>
          </div>
          <ul className="grid gap-3 md:grid-cols-3">
            {matches.map((m) => (
              <li
                key={m.jobRequestId}
                className="card space-y-2"
                data-testid={`trainer-dashboard-match-${m.jobRequestId}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/${locale}/requests/${m.slug}`}
                    className="text-sm font-semibold text-slate-900 hover:text-brand-700"
                  >
                    {m.title}
                  </Link>
                  <span
                    className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-inset ring-brand-100"
                    aria-label={`match score ${m.score}`}
                  >
                    {m.score}
                  </span>
                </div>
                <div className="text-xs text-slate-500">{m.companyName}</div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('dashboard.myApplications')}</h2>
        {apps.length === 0 ? (
          <div className="card text-sm text-slate-500">You haven&apos;t applied to any requests yet.</div>
        ) : (
          <ul className="space-y-3">
            {apps.map((a) => {
              const testCta = testCtaFor(a.status);
              return (
                <li
                  key={a.id}
                  className="card space-y-2"
                  data-testid={`trainer-app-row-${a.id}`}
                >
                  <div className="flex items-center justify-between gap-3">
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
                  </div>
                  {testCta ? (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                      <div className="text-xs text-slate-600">
                        {t(`trainer.tests.dashboardRow.${testCta.messageKey}`)}
                      </div>
                      <Link
                        href={`/${locale}/trainer/applications/${a.id}/test`}
                        className={
                          testCta.variant === 'primary' ? 'btn-primary' : 'btn-secondary'
                        }
                        data-testid={`trainer-test-cta-${a.id}`}
                      >
                        {t(`trainer.tests.dashboardRow.${testCta.ctaKey}`)}
                      </Link>
                    </div>
                  ) : null}
                  {a.status === 'ACCEPTED' || a.status === 'SHORTLISTED' ? (
                    <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-2">
                      <StartChatButton
                        otherUserId={a.request.company.ownerId}
                        requestId={a.request.id}
                        labelKey="messageCompany"
                        dataTestId={`trainer-message-company-${a.id}`}
                      />
                    </div>
                  ) : null}
                  {a.request.modelConnectionId && WORKBENCH_ACCESS_STATUSES.has(a.status) ? (
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                      <div className="text-xs text-slate-600">
                        {t('trainer.workbench.dashboardRow.body')}
                      </div>
                      <Link
                        href={`/${locale}/trainer/applications/${a.id}/workbench`}
                        className="btn-secondary"
                        data-testid={`trainer-workbench-cta-${a.id}`}
                      >
                        {t('trainer.workbench.dashboardRow.cta')}
                      </Link>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

type TestCta = {
  messageKey: 'testAssigned' | 'testSubmitted' | 'graded';
  ctaKey: 'takeCta' | 'viewResultCta';
  variant: 'primary' | 'secondary';
};

function testCtaFor(status: string): TestCta | null {
  if (status === 'TEST_ASSIGNED') {
    return { messageKey: 'testAssigned', ctaKey: 'takeCta', variant: 'primary' };
  }
  if (status === 'TEST_SUBMITTED') {
    return { messageKey: 'testSubmitted', ctaKey: 'viewResultCta', variant: 'secondary' };
  }
  // Once the application moves to ACCEPTED/REJECTED we still surface the
  // result link if the trainer had reached the testing stage. The API will
  // return the same attempt + graded payload. Using a heuristic based on
  // status only avoids an extra N+1 fetch per row.
  return null;
}
