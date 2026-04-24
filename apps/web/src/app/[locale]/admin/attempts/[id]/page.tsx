import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { JsonAccordion } from '@/components/admin/json-accordion';

type AttemptStatus = 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED';

interface Task {
  id: string;
  order: number;
  type: string;
  prompt: string;
  maxScore: number | null;
  weight: number | null;
}

interface Response {
  id: string;
  taskId: string;
  response: unknown;
  autoScore: number | null;
  manualScore: number | null;
  comments: string | null;
  createdAt: string;
}

interface AttemptDetail {
  id: string;
  status: AttemptStatus;
  totalScore: number | null;
  submittedAt: string | null;
  gradedAt: string | null;
  createdAt: string;
  durationSec: number | null;
  test: {
    id: string;
    title: string;
    passingScore: number;
    scoringMode: 'AUTO' | 'MANUAL' | 'HYBRID';
    tasks: Task[];
  };
  responses: Response[];
  application: {
    id: string;
    status: string;
    trainer: { id: string; name: string; email: string } | null;
    request: { id: string; title: string; slug: string };
  } | null;
}

const STATUS_STYLE: Record<AttemptStatus, string> = {
  IN_PROGRESS: 'bg-sky-50 text-sky-700 ring-sky-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 ring-amber-200',
  GRADED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  EXPIRED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

function renderAnswer(answer: unknown): string {
  if (answer == null) return '—';
  if (typeof answer === 'string') return answer;
  if (typeof answer === 'number' || typeof answer === 'boolean') return String(answer);
  return JSON.stringify(answer, null, 2);
}

export default async function AdminAttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let attempt: AttemptDetail;
  try {
    attempt = await authedFetch<AttemptDetail>(`/admin/attempts/${id}`);
  } catch {
    notFound();
  }

  const tasksById = new Map(attempt.test.tasks.map((task) => [task.id, task]));

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link
          href={`/${locale}/admin/tests/${attempt.test.id}`}
          className="hover:text-brand-700"
        >
          ← {attempt.test.title}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[attempt.status]}`}
            >
              {t(
                `admin.attempts.status.${attempt.status}` as 'admin.attempts.status.SUBMITTED',
              )}
            </span>
            {attempt.totalScore != null ? (
              <span className="font-mono text-sm text-slate-700">
                {t('admin.attempts.scoreOf', {
                  score: attempt.totalScore,
                  max: attempt.test.passingScore,
                })}
              </span>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {attempt.application?.trainer?.name ?? '—'}
          </h1>
          <div className="text-xs text-slate-500">
            {attempt.application?.trainer?.email ?? ''}
          </div>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.attempts.col.submittedAt')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {attempt.submittedAt
                ? new Date(attempt.submittedAt).toLocaleString()
                : '—'}
            </dd>
          </div>
          {attempt.gradedAt ? (
            <div>
              <dt className="inline">Graded:</dt>{' '}
              <dd className="inline text-slate-700">
                {new Date(attempt.gradedAt).toLocaleString()}
              </dd>
            </div>
          ) : null}
          {attempt.durationSec != null ? (
            <div>
              <dt className="inline">{t('admin.attempts.col.duration')}:</dt>{' '}
              <dd className="inline text-slate-700">
                {t('admin.attempts.durationSec', { sec: attempt.durationSec })}
              </dd>
            </div>
          ) : null}
        </dl>
      </header>

      {attempt.application ? (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.attempts.section.application')}
          </h2>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Application status</dt>
              <dd className="font-medium text-slate-900">{attempt.application.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Request</dt>
              <dd>
                <Link
                  href={`/${locale}/admin/requests/${attempt.application.request.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {attempt.application.request.title}
                </Link>
              </dd>
            </div>
            {attempt.application.trainer ? (
              <div>
                <dt className="text-slate-500">Trainer</dt>
                <dd>
                  <Link
                    href={`/${locale}/admin/users/${attempt.application.trainer.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {attempt.application.trainer.name}
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.attempts.section.responses')}
        </h2>
        {attempt.responses.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('admin.attempts.noResponses')}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {attempt.responses.map((r) => {
              const task = tasksById.get(r.taskId);
              return (
                <li key={r.id} className="rounded-xl border border-slate-200 bg-white/70 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">
                      {task
                        ? t('admin.tests.task.header', {
                            order: task.order,
                            type: task.type,
                          })
                        : r.taskId}
                    </span>
                    {r.autoScore != null ? (
                      <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] text-sky-700 ring-1 ring-sky-200">
                        auto {r.autoScore}
                      </span>
                    ) : null}
                    {r.manualScore != null ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
                        manual {r.manualScore}
                      </span>
                    ) : null}
                  </div>
                  {task ? (
                    <div className="mt-1 text-xs text-slate-500">{task.prompt}</div>
                  ) : null}
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-[12px] text-slate-100"
                  >
                    {renderAnswer(r.response)}
                  </pre>
                  {r.comments ? (
                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-800">
                      <div className="font-semibold">Reviewer notes (admin view)</div>
                      <div className="whitespace-pre-wrap">{r.comments}</div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <JsonAccordion title="Raw JSON" data={attempt} />
    </div>
  );
}
