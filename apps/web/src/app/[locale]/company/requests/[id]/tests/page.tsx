import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { DeleteTestButton } from './delete-test-button';

interface TestRow {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  passingScore: number;
  scoringMode: string;
  createdAt: string;
  _count: { tasks: number; attempts: number };
}

export default async function TestsListPage({
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

  const tests = await authedFetch<TestRow[]>(`/tests?requestId=${id}`).catch(() => [] as TestRow[]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">{t('company.tests.title')}</h1>
        <Link
          href={`/${locale}/company/requests/${id}/tests/new`}
          className="rounded-md border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          data-testid="tests-new-button"
        >
          {t('company.tests.new')}
        </Link>
      </div>
      <div className="text-xs">
        <Link
          href={`/${locale}/company/requests/${id}/applications`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {t('company.tests.backToApplications')}
        </Link>
      </div>
      {tests.length === 0 ? (
        <div className="card text-sm text-slate-500" data-testid="tests-empty">
          {t('company.tests.empty')}
        </div>
      ) : (
        <ul className="space-y-3" data-testid="tests-list">
          {tests.map((test) => (
            <li key={test.id} className="card space-y-2" data-testid={`test-row-${test.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{test.title}</div>
                  {test.description ? (
                    <p className="whitespace-pre-line text-sm text-slate-600">{test.description}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
                  <span>{t('company.tests.meta.tasks', { count: test._count.tasks })}</span>
                  <span>{t('company.tests.meta.attempts', { count: test._count.attempts })}</span>
                  {test.timeLimitMin ? (
                    <span>{t('company.tests.meta.timeLimit', { minutes: test.timeLimitMin })}</span>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                <Link
                  href={`/${locale}/company/requests/${id}/tests/${test.id}/edit`}
                  className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  data-testid={`test-edit-${test.id}`}
                >
                  {t('company.tests.edit')}
                </Link>
                <DeleteTestButton testId={test.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
