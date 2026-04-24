'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Task {
  id: string;
  type: string;
  prompt: string;
  options: string[];
  answerKey: string | null;
  maxScore: number;
  order: number;
}

interface Response {
  id: string;
  taskId: string;
  response: unknown;
  autoScore: number | null;
  manualScore: number | null;
  comments: string | null;
}

export interface AttemptView {
  id: string;
  status: string;
  totalScore: number | null;
  submittedAt: string | null;
  reviewerNotes: string | null;
  test: {
    id: string;
    title: string;
    passingScore: number;
    tasks: Task[];
  };
  responses: Response[];
}

function renderResponse(resp: unknown): string {
  if (resp === null || resp === undefined) return '';
  if (typeof resp === 'string') return resp;
  if (typeof resp === 'object') {
    const obj = resp as { value?: unknown };
    if (obj.value !== undefined) return renderResponse(obj.value);
    try {
      return JSON.stringify(resp, null, 2);
    } catch {
      return String(resp);
    }
  }
  return String(resp);
}

export function GradingConsole({
  attempt,
  backUrl,
}: {
  attempt: AttemptView;
  backUrl: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState<string>(attempt.reviewerNotes ?? '');

  const responseByTask = useMemo(() => {
    const map = new Map<string, Response>();
    for (const r of attempt.responses) map.set(r.taskId, r);
    return map;
  }, [attempt.responses]);

  const [grades, setGrades] = useState<Record<string, { manualScore: number; comments: string }>>(
    () => {
      const initial: Record<string, { manualScore: number; comments: string }> = {};
      for (const task of attempt.test.tasks) {
        const r = responseByTask.get(task.id);
        initial[task.id] = {
          manualScore: r?.manualScore ?? r?.autoScore ?? 0,
          comments: r?.comments ?? '',
        };
      }
      return initial;
    },
  );

  const pending = submitting || refreshing;
  const readOnly = attempt.status === 'GRADED';

  function updateGrade(taskId: string, patch: Partial<{ manualScore: number; comments: string }>) {
    setGrades((g) => ({ ...g, [taskId]: { ...g[taskId]!, ...patch } }));
  }

  async function submit() {
    if (submitting) return;
    setError(null);
    setSuccess(null);
    for (const task of attempt.test.tasks) {
      const g = grades[task.id]!;
      if (g.manualScore < 0 || g.manualScore > task.maxScore) {
        setError(t('company.tests.grading.errors.scoreRange', { max: task.maxScore }));
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
        grades: attempt.test.tasks.map((task) => ({
          taskId: task.id,
          manualScore: grades[task.id]!.manualScore,
          comments: grades[task.id]!.comments.trim() || undefined,
        })),
        reviewerNotes: reviewerNotes.trim() || undefined,
      };
      const res = await fetch(`/api/proxy/tests/attempts/${attempt.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body?.message ?? t('company.tests.errors.generic'));
        return;
      }
      setSuccess(t('company.tests.grading.result.title'));
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <a href={backUrl} className="text-brand-600 hover:text-brand-700">
          ← {t('company.tests.grading.backToApplicant')}
        </a>
      </div>
      <header className="card space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">{attempt.test.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>{t(`company.tests.attempts.status.${attempt.status.toLowerCase()}`)}</span>
          {attempt.totalScore !== null ? (
            <span>{t('company.tests.grading.currentTotal', { score: attempt.totalScore })}</span>
          ) : null}
          <span
            className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200"
            title={t('company.tests.grading.passingHintTooltip')}
            data-testid="passing-score-hint"
          >
            {t('company.tests.grading.passingHint', { score: attempt.test.passingScore })}
          </span>
        </div>
      </header>

      <ol className="space-y-4">
        {attempt.test.tasks.map((task, index) => {
          const response = responseByTask.get(task.id);
          const g = grades[task.id]!;
          const isAuto = task.type === 'MCQ' && task.answerKey !== null;
          return (
            <li key={task.id} className="card space-y-3" data-testid={`grading-task-${task.id}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-800">
                  {t('company.tests.grading.taskHeading', {
                    n: index + 1,
                    type: task.type,
                    max: task.maxScore,
                  })}
                </div>
                {isAuto && response?.autoScore !== null && response?.autoScore !== undefined ? (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700 ring-1 ring-inset ring-sky-200">
                    {t('company.tests.grading.task.auto', {
                      score: response.autoScore,
                      max: task.maxScore,
                    })}
                  </span>
                ) : null}
              </div>
              <p className="whitespace-pre-line text-sm text-slate-700">{task.prompt}</p>
              {task.type === 'MCQ' && task.options.length > 0 ? (
                <ul className="space-y-1 text-sm">
                  {task.options.map((opt) => {
                    const picked = renderResponse(response?.response) === opt;
                    const correct = task.answerKey === opt;
                    return (
                      <li
                        key={opt}
                        className={`rounded border px-2 py-1 ${
                          correct
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            : picked
                              ? 'border-rose-200 bg-rose-50 text-rose-800'
                              : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        {picked ? '● ' : '○ '}
                        {opt}
                        {correct
                          ? ` · ${t('company.tests.grading.task.correctOption')}`
                          : ''}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <pre className="whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-xs text-slate-800">
                  {renderResponse(response?.response) || t('company.tests.grading.task.noResponse')}
                </pre>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-700">
                    {t('company.tests.grading.task.manual', { max: task.maxScore })}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={task.maxScore}
                    className="input mt-1"
                    value={g.manualScore}
                    disabled={readOnly}
                    onChange={(e) =>
                      updateGrade(task.id, { manualScore: Number(e.target.value || 0) })
                    }
                    data-testid={`grading-score-${task.id}`}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-700">
                    {t('company.tests.grading.task.comments')}
                  </span>
                  <textarea
                    className="input mt-1 min-h-[60px]"
                    value={g.comments}
                    maxLength={2000}
                    disabled={readOnly}
                    onChange={(e) => updateGrade(task.id, { comments: e.target.value })}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="card space-y-2">
        <label className="block text-sm">
          <span className="text-slate-700">
            {t('company.tests.grading.reviewerNotes')}
          </span>
          <textarea
            className="input mt-1 min-h-[80px]"
            value={reviewerNotes}
            maxLength={4000}
            disabled={readOnly}
            onChange={(e) => setReviewerNotes(e.target.value)}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {t('company.tests.grading.reviewerNotesHint')}
          </span>
        </label>
      </section>

      {error ? (
        <div className="rounded bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>
      ) : null}
      {readOnly ? (
        <div className="text-xs text-slate-500" data-testid="grading-readonly">
          {t('company.tests.grading.alreadyGraded')}
        </div>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-md border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          data-testid="grading-submit"
        >
          {pending ? t('common.loading') : t('company.tests.grading.submit')}
        </button>
      )}
    </div>
  );
}
