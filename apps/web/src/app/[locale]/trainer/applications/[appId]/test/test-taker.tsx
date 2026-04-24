'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface TrainerTestTask {
  id: string;
  type: 'MCQ' | 'TEXT' | 'CODE';
  prompt: string;
  options: string[];
  maxScore: number;
  order: number;
}

export interface TrainerTestView {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  passingScore: number;
  tasks: TrainerTestTask[];
}

export interface TrainerAttempt {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED';
  totalScore: number | null;
  submittedAt: string | null;
  scoreBreakdown: unknown;
}

type AnswerMap = Record<string, string>;

export function TestTaker({
  applicationId,
  test,
  attempt,
}: {
  applicationId: string;
  test: TrainerTestView;
  attempt: TrainerAttempt | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState<TrainerAttempt | null>(attempt);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [error, setError] = useState<string | null>(null);

  const answerableTasks = useMemo(
    () => test.tasks.filter((task) => task.type !== 'CODE'),
    [test.tasks],
  );
  const pending = starting || submitting || refreshing;

  async function start() {
    if (starting) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/proxy/tests/${test.id}/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body?.message ?? t('trainer.tests.take.errors.generic'));
        return;
      }
      const created = (await res.json()) as TrainerAttempt;
      setCurrentAttempt(created);
      startTransition(() => router.refresh());
    } finally {
      setStarting(false);
    }
  }

  function setAnswer(taskId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [taskId]: value }));
  }

  async function submit() {
    if (!currentAttempt || submitting) return;
    const unanswered = answerableTasks.filter(
      (task) => !(answers[task.id] ?? '').trim(),
    );
    const confirmMessage =
      unanswered.length > 0
        ? t('trainer.tests.take.unanswered', { count: unanswered.length })
        : t('trainer.tests.take.confirmSubmit');
    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const responses = answerableTasks
        .map((task) => {
          const raw = answers[task.id];
          if (raw === undefined || raw === null || raw === '') return null;
          return { taskId: task.id, response: raw };
        })
        .filter((r): r is { taskId: string; response: string } => r !== null);

      const res = await fetch(
        `/api/proxy/tests/attempts/${currentAttempt.id}/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responses }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        if (res.status === 400 && body?.message?.includes('already')) {
          setError(t('trainer.tests.take.errors.alreadySubmitted'));
        } else {
          setError(body?.message ?? t('trainer.tests.take.errors.generic'));
        }
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="trainer-test-taker">
      <header className="card space-y-2">
        <h1 className="text-2xl font-bold text-slate-900">
          {t('trainer.tests.page.title', { testTitle: test.title })}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {t('trainer.tests.page.tasksCount', { count: test.tasks.length })}
          </span>
          {test.timeLimitMin ? (
            <span>{t('trainer.tests.page.timeLimit', { minutes: test.timeLimitMin })}</span>
          ) : null}
          <span
            className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200"
            title={t('trainer.tests.page.passingHintTooltip')}
            data-testid="trainer-passing-hint"
          >
            {t('trainer.tests.page.passingHint', { score: test.passingScore })}
          </span>
        </div>
        {test.description ? (
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{test.description}</p>
        ) : null}
      </header>

      {!currentAttempt ? (
        <section className="card space-y-3" data-testid="trainer-test-ready">
          <h2 className="text-lg font-semibold text-slate-900">
            {t('trainer.tests.page.ready.title')}
          </h2>
          <p className="text-sm text-slate-600">{t('trainer.tests.page.ready.body')}</p>
          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          <button
            type="button"
            className="btn-primary"
            onClick={start}
            disabled={pending}
            data-testid="trainer-test-start"
          >
            {starting
              ? t('trainer.tests.page.ready.starting')
              : t('trainer.tests.page.ready.startCta')}
          </button>
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
          data-testid="trainer-test-form"
        >
          <ol className="space-y-4">
            {test.tasks.map((task, i) => (
              <li key={task.id} className="card space-y-3">
                <header className="text-xs uppercase tracking-wide text-slate-500">
                  {t('trainer.tests.take.taskHeading', {
                    n: i + 1,
                    total: test.tasks.length,
                    type: t(`trainer.tests.take.type.${task.type === 'CODE' ? 'TEXT' : task.type}`),
                    max: task.maxScore,
                  })}
                </header>
                <p className="text-sm text-slate-800 whitespace-pre-wrap">{task.prompt}</p>
                {task.type === 'MCQ' ? (
                  <div className="space-y-2" data-testid={`trainer-task-mcq-${task.id}`}>
                    <p className="text-xs text-slate-500">{t('trainer.tests.take.mcqHint')}</p>
                    {task.options.map((opt, oi) => {
                      const id = `task-${task.id}-opt-${oi}`;
                      return (
                        <label
                          key={id}
                          htmlFor={id}
                          className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                        >
                          <input
                            id={id}
                            type="radio"
                            name={`answer-task-${task.id}`}
                            value={opt}
                            checked={(answers[task.id] ?? '') === opt}
                            onChange={() => setAnswer(task.id, opt)}
                            data-testid={`trainer-task-${task.id}-opt-${oi}`}
                          />
                          <span>{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : task.type === 'TEXT' ? (
                  <div className="space-y-1" data-testid={`trainer-task-text-${task.id}`}>
                    <p className="text-xs text-slate-500">{t('trainer.tests.take.textHint')}</p>
                    <textarea
                      rows={5}
                      value={answers[task.id] ?? ''}
                      onChange={(e) => setAnswer(task.id, e.target.value)}
                      placeholder={t('trainer.tests.take.textPlaceholder')}
                      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      data-testid={`trainer-task-${task.id}-text`}
                    />
                  </div>
                ) : (
                  // CODE tasks aren't answerable in C3 UI; render the prompt
                  // read-only so the trainer can still see full test context.
                  <p className="text-xs italic text-slate-400">
                    {t('trainer.tests.take.type.TEXT')}
                  </p>
                )}
              </li>
            ))}
          </ol>

          {error ? (
            <div
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              data-testid="trainer-test-error"
            >
              {error}
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              className="btn-primary"
              disabled={pending}
              data-testid="trainer-test-submit"
            >
              {submitting
                ? t('trainer.tests.take.submitting')
                : t('trainer.tests.take.submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
