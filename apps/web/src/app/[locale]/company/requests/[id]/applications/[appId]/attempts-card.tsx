import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

interface AttemptRow {
  id: string;
  status: string;
  totalScore: number | null;
  submittedAt: string | null;
  createdAt: string;
  test: { id: string; title: string; passingScore: number };
}

function statusKey(status: string): string {
  switch (status) {
    case 'IN_PROGRESS':
      return 'company.tests.attempts.status.inProgress';
    case 'SUBMITTED':
      return 'company.tests.attempts.status.submitted';
    case 'GRADED':
      return 'company.tests.attempts.status.graded';
    default:
      return 'company.tests.attempts.status.inProgress';
  }
}

export async function AttemptsCard({
  applicationId,
  requestId,
  locale,
}: {
  applicationId: string;
  requestId: string;
  locale: string;
}) {
  const t = await getTranslations();
  const attempts = await authedFetch<AttemptRow[]>(
    `/applications/${applicationId}/attempts`,
  ).catch(() => [] as AttemptRow[]);

  return (
    <section className="card space-y-3" data-testid="application-attempts">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('company.tests.attempts.title')}
      </h2>
      {attempts.length === 0 ? (
        <div className="text-sm text-slate-500">{t('company.tests.attempts.empty')}</div>
      ) : (
        <ul className="space-y-3">
          {attempts.map((a) => (
            <li key={a.id} className="border-l-2 border-slate-200 pl-3" data-testid={`attempt-row-${a.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-slate-800">{a.test.title}</div>
                  <div className="text-xs text-slate-500">
                    {t(statusKey(a.status))}
                    {a.totalScore !== null
                      ? ` · ${t('company.tests.attempts.total', {
                          score: a.totalScore,
                        })}`
                      : ''}
                  </div>
                </div>
                {a.status === 'SUBMITTED' || a.status === 'GRADED' ? (
                  <Link
                    href={`/${locale}/company/requests/${requestId}/applications/${applicationId}/attempts/${a.id}`}
                    className="rounded-md border border-brand-600 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    data-testid={`grade-attempt-${a.id}`}
                  >
                    {a.status === 'SUBMITTED'
                      ? t('company.tests.attempts.gradeCta')
                      : t('company.tests.attempts.reviewCta')}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
