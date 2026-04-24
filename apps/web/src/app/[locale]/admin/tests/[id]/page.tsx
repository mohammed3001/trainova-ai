import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { JsonAccordion } from '@/components/admin/json-accordion';

type ScoringMode = 'AUTO' | 'MANUAL' | 'HYBRID';

interface Task {
  id: string;
  order: number;
  type: string;
  prompt: string;
  weight: number | null;
  maxScore: number | null;
}

interface StatusBreakdown {
  [status: string]: { count: number; avgScore: number | null };
}

interface TestDetail {
  id: string;
  title: string;
  description: string | null;
  scoringMode: ScoringMode;
  passingScore: number;
  timeLimitMin: number | null;
  createdAt: string;
  updatedAt: string;
  tasks: Task[];
  request: {
    id: string;
    slug: string;
    title: string;
    company: { id: string; name: string; slug: string };
  };
  _count: { attempts: number };
  statusBreakdown: StatusBreakdown;
}

interface AttemptRow {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED';
  totalScore: number | null;
  submittedAt: string | null;
  createdAt: string;
  durationSec: number | null;
  test: { id: string; title: string; passingScore: number };
  application: {
    id: string;
    trainer: { id: string; name: string; email: string } | null;
  } | null;
}

interface AttemptsPage {
  items: AttemptRow[];
  nextCursor: string | null;
}

const STATUS_STYLE: Record<AttemptRow['status'], string> = {
  IN_PROGRESS: 'bg-sky-50 text-sky-700 ring-sky-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  GRADED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  EXPIRED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function AdminTestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let test: TestDetail;
  try {
    test = await authedFetch<TestDetail>(`/admin/tests/${id}`);
  } catch {
    notFound();
  }

  const attempts = await authedFetch<AttemptsPage>(
    `/admin/attempts?testId=${encodeURIComponent(id)}&limit=50`,
  );

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/tests`} className="hover:text-brand-700">
          ← {t('admin.tests.title')}
        </Link>
      </nav>

      <header className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <Link
            href={`/${locale}/admin/requests/${test.request.id}`}
            className="text-brand-700 hover:underline"
          >
            {test.request.title}
          </Link>
          <span>·</span>
          <span>{test.request.company.name}</span>
        </div>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">{test.title}</h1>
        {test.description ? (
          <p className="mt-2 max-w-3xl text-sm text-slate-600">{test.description}</p>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.tests.section.meta')}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tests.col.scoringMode')}</dt>
              <dd className="font-medium text-slate-900">
                {t(`admin.tests.scoringMode.${test.scoringMode}` as 'admin.tests.scoringMode.AUTO')}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tests.col.passingScore')}</dt>
              <dd className="font-medium text-slate-900">{test.passingScore}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Time limit</dt>
              <dd className="font-medium text-slate-900">
                {test.timeLimitMin != null ? `${test.timeLimitMin} min` : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.tests.col.attempts')}</dt>
              <dd className="font-medium text-slate-900">{test._count.attempts}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.tests.section.breakdown')}
          </h2>
          {Object.keys(test.statusBreakdown).length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">—</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(test.statusBreakdown).map(([status, v]) => (
                <div key={status} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <dt className="text-xs text-slate-500">{status}</dt>
                  <dd className="text-lg font-semibold text-slate-900">{v.count}</dd>
                  {v.avgScore != null ? (
                    <div className="text-[11px] text-slate-500">avg {v.avgScore.toFixed(1)}</div>
                  ) : null}
                </div>
              ))}
            </dl>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.tests.section.tasks')}
        </h2>
        {test.tasks.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">—</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {test.tasks.map((task) => (
              <li key={task.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono">
                    {t('admin.tests.task.header', { order: task.order, type: task.type })}
                  </span>
                  {task.weight != null ? (
                    <span>{t('admin.tests.task.weight', { weight: task.weight })}</span>
                  ) : null}
                  {task.maxScore != null ? <span>max {task.maxScore}</span> : null}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                  {task.prompt}
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.tests.section.attempts')}
        </h2>
        {attempts.items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('admin.attempts.empty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {attempts.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/${locale}/admin/attempts/${a.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-brand-50/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-900">
                      {a.application?.trainer?.name ?? '—'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {a.application?.trainer?.email ?? ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[a.status]}`}
                    >
                      {t(
                        `admin.attempts.status.${a.status}` as 'admin.attempts.status.SUBMITTED',
                      )}
                    </span>
                    {a.totalScore != null ? (
                      <span className="font-mono text-slate-700">
                        {t('admin.attempts.scoreOf', {
                          score: a.totalScore,
                          max: a.test.passingScore,
                        })}
                      </span>
                    ) : null}
                    <span className="text-slate-500">
                      {a.submittedAt
                        ? new Date(a.submittedAt).toLocaleDateString()
                        : new Date(a.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <JsonAccordion title="Raw JSON" data={test} />
    </div>
  );
}
