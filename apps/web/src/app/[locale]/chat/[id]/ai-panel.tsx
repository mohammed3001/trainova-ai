'use client';

/**
 * Inline AI assistant for an open conversation.
 *
 * Renders a collapsible panel above the composer with two on-demand
 * actions:
 *   - **Summary** — calls `/ai-assist/chat-summary` and shows the
 *     1-paragraph summary plus up to 10 key points.
 *   - **Tasks**   — calls `/ai-assist/chat-tasks` and shows up to 20
 *     extracted action items, each with optional owner and due hints.
 *
 * Both endpoints already exist on the API (T7.A AI Assistant Suite). They
 * are gated by the `ai_assistant` feature flag and the chat participant
 * check on the conversation, so we just render a clean failure state if
 * either gate denies the call.
 *
 * The panel is intentionally collapsed by default. Generation is **not**
 * triggered on mount because the LLM costs money — the user has to opt
 * in by clicking "Summarize" or "Extract tasks". Results are cached in
 * local component state for the lifetime of the open chat-room; the user
 * can re-run either action at any time (e.g. after new messages arrive).
 *
 * A local generation overrides any prior result for that action so the
 * panel never silently shows stale data after a manual refresh.
 */

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  extractChatTasks,
  summarizeChat,
  type ChatSummaryResult,
  type ChatTasksResult,
} from '@/lib/chat-api';

interface Props {
  conversationId: string;
}

interface ApiError {
  status?: number;
  message?: string;
}

function readError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as ApiError;
    if (typeof e.message === 'string' && e.message.trim().length > 0) return e.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function AiPanel({ conversationId }: Props) {
  const t = useTranslations('chat.ai');
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<ChatSummaryResult | null>(null);
  const [tasks, setTasks] = useState<ChatTasksResult | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const runSummary = useCallback(async () => {
    if (summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const result = await summarizeChat(conversationId);
      setSummary(result);
    } catch (e) {
      setSummaryError(readError(e, t('errorGeneric')));
    } finally {
      setSummaryLoading(false);
    }
  }, [conversationId, summaryLoading, t]);

  const runTasks = useCallback(async () => {
    if (tasksLoading) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const result = await extractChatTasks(conversationId);
      setTasks(result);
    } catch (e) {
      setTasksError(readError(e, t('errorGeneric')));
    } finally {
      setTasksLoading(false);
    }
  }, [conversationId, tasksLoading, t]);

  return (
    <div
      className="border-b border-slate-200 bg-gradient-to-r from-violet-50/60 via-white to-brand-50/60"
      data-testid="chat-ai-panel"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-white/40"
        aria-expanded={open}
        data-testid="chat-ai-toggle"
      >
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-5 w-5 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-brand-500 text-[10px] font-bold text-white"
          >
            AI
          </span>
          {t('title')}
        </span>
        <span className="text-slate-400" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open ? (
        <div className="grid gap-3 px-4 pb-4 pt-1 sm:grid-cols-2">
          {/* Summary card */}
          <section
            className="rounded-lg border border-slate-200 bg-white/80 p-3"
            aria-labelledby={`ai-summary-heading-${conversationId}`}
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3
                id={`ai-summary-heading-${conversationId}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {t('summaryTitle')}
              </h3>
              <button
                type="button"
                onClick={() => void runSummary()}
                disabled={summaryLoading}
                className="text-[11px] font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="chat-ai-summary-run"
              >
                {summaryLoading
                  ? t('working')
                  : summary
                    ? t('regenerate')
                    : t('summarize')}
              </button>
            </header>

            {summaryError ? (
              <p className="text-[11px] text-red-600" data-testid="chat-ai-summary-error">
                {summaryError}
              </p>
            ) : summary ? (
              <div className="space-y-2" data-testid="chat-ai-summary-result">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700">
                  {summary.summary}
                </p>
                {summary.keyPoints.length > 0 ? (
                  <ul className="ms-4 list-disc space-y-0.5 text-[11px] text-slate-600">
                    {summary.keyPoints.map((kp, i) => (
                      <li key={i}>{kp}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">{t('summaryHint')}</p>
            )}
          </section>

          {/* Tasks card */}
          <section
            className="rounded-lg border border-slate-200 bg-white/80 p-3"
            aria-labelledby={`ai-tasks-heading-${conversationId}`}
          >
            <header className="mb-2 flex items-center justify-between gap-2">
              <h3
                id={`ai-tasks-heading-${conversationId}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {t('tasksTitle')}
              </h3>
              <button
                type="button"
                onClick={() => void runTasks()}
                disabled={tasksLoading}
                className="text-[11px] font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="chat-ai-tasks-run"
              >
                {tasksLoading
                  ? t('working')
                  : tasks
                    ? t('regenerate')
                    : t('extract')}
              </button>
            </header>

            {tasksError ? (
              <p className="text-[11px] text-red-600" data-testid="chat-ai-tasks-error">
                {tasksError}
              </p>
            ) : tasks ? (
              tasks.tasks.length === 0 ? (
                <p className="text-[11px] text-slate-400" data-testid="chat-ai-tasks-empty">
                  {t('tasksEmpty')}
                </p>
              ) : (
                <ol
                  className="ms-4 list-decimal space-y-1.5 text-[11px] text-slate-700"
                  data-testid="chat-ai-tasks-result"
                >
                  {tasks.tasks.map((task, i) => (
                    <li key={i}>
                      <p className="font-medium">{task.text}</p>
                      {task.ownerHint || task.dueHint ? (
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {task.ownerHint ? (
                            <span>
                              {t('owner')}: <span className="font-medium">{task.ownerHint}</span>
                            </span>
                          ) : null}
                          {task.ownerHint && task.dueHint ? <span aria-hidden> · </span> : null}
                          {task.dueHint ? (
                            <span>
                              {t('due')}: <span className="font-medium">{task.dueHint}</span>
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )
            ) : (
              <p className="text-[11px] text-slate-400">{t('tasksHint')}</p>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
