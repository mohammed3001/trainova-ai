'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  extractChatTasks,
  summarizeChat,
  type ChatSummaryResult,
  type ChatTaskItem,
  type ChatTasksResult,
} from '@/lib/chat-ai-api';

interface Props {
  conversationId: string;
}

type LoadState = 'idle' | 'loading' | 'error';

/**
 * T8.A — inline AI co-pilot panel for the chat room.
 *
 * Two opt-in actions:
 *   • Summary    → POST /ai-assist/chat-summary  (1 paragraph + ≤10 key points)
 *   • Tasks      → POST /ai-assist/chat-tasks    (≤20 action items, with
 *                                                  optional owner / due hints)
 *
 * Generation is **never automatic**: the LLM costs tokens, and the AI
 * Assist module is feature-flagged (`ai_assistant`) and verified-user
 * gated on the API. The panel starts collapsed and renders a
 * description-only state until the user explicitly clicks one of the
 * action buttons. Results are cached in component state so navigating
 * away from the room and back doesn't re-bill — but the room is
 * remounted on conversation change, so a fresh conversation always
 * starts from scratch (which is what we want).
 */
export function AiPanel({ conversationId }: Props) {
  const t = useTranslations('chat.ai');
  const [open, setOpen] = useState(false);

  const [summary, setSummary] = useState<ChatSummaryResult | null>(null);
  const [summaryState, setSummaryState] = useState<LoadState>('idle');
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [tasks, setTasks] = useState<ChatTasksResult | null>(null);
  const [tasksState, setTasksState] = useState<LoadState>('idle');
  const [tasksError, setTasksError] = useState<string | null>(null);

  const runSummary = async () => {
    setSummaryState('loading');
    setSummaryError(null);
    try {
      setSummary(await summarizeChat(conversationId));
      setSummaryState('idle');
    } catch (err) {
      const e = err as Error & { status?: number };
      setSummaryError(e.message || t('errorGeneric'));
      setSummaryState('error');
    }
  };

  const runTasks = async () => {
    setTasksState('loading');
    setTasksError(null);
    try {
      setTasks(await extractChatTasks(conversationId));
      setTasksState('idle');
    } catch (err) {
      const e = err as Error & { status?: number };
      setTasksError(e.message || t('errorGeneric'));
      setTasksState('error');
    }
  };

  return (
    <section
      className="border-b border-violet-200/60 bg-gradient-to-r from-violet-50/80 via-white to-brand-50/60"
      aria-label={t('title')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-violet-700 transition hover:bg-violet-100/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        aria-expanded={open}
        data-testid="chat-ai-toggle"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-4 w-4 fill-none stroke-violet-600"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2v4" />
          <path d="M12 18v4" />
          <path d="m4.93 4.93 2.83 2.83" />
          <path d="m16.24 16.24 2.83 2.83" />
          <path d="M2 12h4" />
          <path d="M18 12h4" />
          <path d="m4.93 19.07 2.83-2.83" />
          <path d="m16.24 7.76 2.83-2.83" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span className="flex-1">{t('title')}</span>
        <span
          className="text-violet-500 transition"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      {open && (
        <div className="grid gap-3 px-4 pb-4 md:grid-cols-2" data-testid="chat-ai-panel">
          {/* Summary card */}
          <article className="rounded-xl border border-violet-200/60 bg-white/80 p-3 shadow-sm backdrop-blur">
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t('summaryTitle')}</h3>
              <button
                type="button"
                onClick={runSummary}
                disabled={summaryState === 'loading'}
                className="rounded-md bg-violet-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="chat-ai-summarize"
              >
                {summaryState === 'loading'
                  ? t('working')
                  : summary
                    ? t('regenerate')
                    : t('summarize')}
              </button>
            </header>
            {summary ? (
              <div className="space-y-2 text-sm">
                {summaryState === 'error' && summaryError && (
                  <p
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                    role="status"
                  >
                    {summaryError}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-slate-700" lang={summary.language}>
                  {summary.summary}
                </p>
                {summary.keyPoints.length > 0 && (
                  <ul className="ms-4 list-disc space-y-1 text-slate-600">
                    {summary.keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : summaryState === 'error' ? (
              <p className="text-sm text-rose-600">{summaryError}</p>
            ) : (
              <p className="text-xs text-slate-500">{t('summaryHint')}</p>
            )}
          </article>

          {/* Action items card */}
          <article className="rounded-xl border border-brand-200/60 bg-white/80 p-3 shadow-sm backdrop-blur">
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t('tasksTitle')}</h3>
              <button
                type="button"
                onClick={runTasks}
                disabled={tasksState === 'loading'}
                className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="chat-ai-tasks"
              >
                {tasksState === 'loading'
                  ? t('working')
                  : tasks
                    ? t('regenerate')
                    : t('extract')}
              </button>
            </header>
            {tasks ? (
              <div className="space-y-2">
                {tasksState === 'error' && tasksError && (
                  <p
                    className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
                    role="status"
                  >
                    {tasksError}
                  </p>
                )}
                {tasks.tasks.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('tasksEmpty')}</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {tasks.tasks.map((task, i) => (
                      <TaskRow key={i} task={task} t={t} />
                    ))}
                  </ul>
                )}
              </div>
            ) : tasksState === 'error' ? (
              <p className="text-sm text-rose-600">{tasksError}</p>
            ) : (
              <p className="text-xs text-slate-500">{t('tasksHint')}</p>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

function TaskRow({
  task,
  t,
}: {
  task: ChatTaskItem;
  t: ReturnType<typeof useTranslations<'chat.ai'>>;
}) {
  return (
    <li className="rounded-lg border border-slate-200/70 bg-white px-2.5 py-1.5">
      <p className="text-slate-800">{task.text}</p>
      {(task.ownerHint || task.dueHint) && (
        <p className="mt-0.5 flex flex-wrap gap-2 text-[11px] text-slate-500">
          {task.ownerHint && (
            <span>
              <span className="font-medium text-slate-600">{t('owner')}:</span>{' '}
              {task.ownerHint}
            </span>
          )}
          {task.dueHint && (
            <span>
              <span className="font-medium text-slate-600">{t('due')}:</span>{' '}
              {task.dueHint}
            </span>
          )}
        </p>
      )}
    </li>
  );
}
