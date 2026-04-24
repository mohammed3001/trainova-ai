'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  MODEL_CALL_OPERATIONS,
  type ModelCallOperation,
  type PublicModelCall,
  type WorkbenchCallInput,
  type WorkbenchCallResult,
  type WorkbenchMessage,
} from '@trainova/shared';

/* ---------------------------------------------------------------------- */

export interface WorkbenchContext {
  application: {
    id: string;
    status: string;
    requestId: string;
    requestTitle: string;
    requestSlug: string;
  };
  connection: {
    id: string;
    name: string;
    provider: string;
    modelId: string | null;
    status: string;
  } | null;
  canCall: boolean;
  reason: string | null;
}

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ---------------------------------------------------------------------- */

interface Props {
  applicationId: string;
  context: WorkbenchContext;
  initialCalls: PublicModelCall[];
}

export function WorkbenchClient({ applicationId, context, initialCalls }: Props) {
  const t = useTranslations('trainer.workbench');
  const [operation, setOperation] = useState<ModelCallOperation>('CHAT');
  const [systemText, setSystemText] = useState('');
  const [userText, setUserText] = useState('');
  const [temperature, setTemperature] = useState<string>('');
  const [maxTokens, setMaxTokens] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WorkbenchCallResult | null>(null);
  const [history, setHistory] = useState<PublicModelCall[]>(initialCalls);

  const disabled = !context.canCall || submitting;

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled) return;
      setSubmitting(true);
      setError(null);
      setResult(null);
      try {
        const payload = buildPayload(operation, systemText, userText, temperature, maxTokens);
        const res = await proxyJson<WorkbenchCallResult>(
          `/applications/${applicationId}/workbench/call`,
          { method: 'POST', body: JSON.stringify(payload) },
        );
        setResult(res);
        // Prepend to the visible history so the trainer immediately sees
        // their new call without waiting for a refetch.
        const newest = await proxyJson<PublicModelCall[]>(
          `/applications/${applicationId}/workbench/calls?limit=50`,
        );
        setHistory(newest);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [applicationId, operation, systemText, userText, temperature, maxTokens, disabled],
  );

  return (
    <div className="space-y-6" data-testid="workbench-root">
      <HeaderCard context={context} />

      {!context.canCall && context.reason ? (
        <div
          className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 text-sm text-amber-900 backdrop-blur"
          data-testid="workbench-blocked"
          role="status"
        >
          <BlockedReason reason={context.reason} />
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className="card space-y-4"
        aria-describedby="workbench-heading"
      >
        <h2
          id="workbench-heading"
          className="text-base font-semibold text-slate-900"
        >
          {t('composer.title')}
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-xs font-medium text-slate-600">
            <span>{t('composer.operation')}</span>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value as ModelCallOperation)}
              className="input"
              disabled={disabled}
              data-testid="workbench-operation"
            >
              {MODEL_CALL_OPERATIONS.map((op) => (
                <option key={op} value={op}>
                  {t(`operations.${op.toLowerCase()}` as never)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            <span>{t('composer.temperature')}</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={temperature}
              onChange={(e) => setTemperature(e.target.value)}
              className="input"
              placeholder="0.7"
              disabled={disabled}
              inputMode="decimal"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            <span>{t('composer.maxTokens')}</span>
            <input
              type="number"
              step="1"
              min="1"
              max="8192"
              value={maxTokens}
              onChange={(e) => setMaxTokens(e.target.value)}
              className="input"
              placeholder="1024"
              disabled={disabled}
              inputMode="numeric"
            />
          </label>
        </div>

        {operation !== 'EMBED' ? (
          <label className="block space-y-1 text-xs font-medium text-slate-600">
            <span>{t('composer.system')}</span>
            <textarea
              value={systemText}
              onChange={(e) => setSystemText(e.target.value)}
              className="input min-h-20 resize-y"
              rows={2}
              placeholder={t('composer.systemPlaceholder')}
              disabled={disabled}
              data-testid="workbench-system"
            />
          </label>
        ) : null}

        <label className="block space-y-1 text-xs font-medium text-slate-600">
          <span>
            {operation === 'EMBED'
              ? t('composer.input')
              : t('composer.user')}
          </span>
          <textarea
            value={userText}
            onChange={(e) => setUserText(e.target.value)}
            className="input min-h-32 resize-y font-mono"
            rows={6}
            placeholder={
              operation === 'EMBED'
                ? t('composer.inputPlaceholder')
                : t('composer.userPlaceholder')
            }
            disabled={disabled}
            required
            data-testid="workbench-user"
          />
        </label>

        {error ? (
          <p className="text-xs text-rose-600" data-testid="workbench-error">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500">{t('composer.hint')}</p>
          <button
            type="submit"
            disabled={disabled || userText.trim().length === 0}
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-brand-500 hover:to-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="workbench-submit"
          >
            {submitting ? t('composer.submitting') : t('composer.submit')}
          </button>
        </div>
      </form>

      {result ? <ResultCard result={result} /> : null}

      <HistoryCard history={history} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */

function HeaderCard({ context }: { context: WorkbenchContext }) {
  const t = useTranslations('trainer.workbench');
  const { connection } = context;
  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-white/40 bg-gradient-to-br from-brand-50/70 via-white to-indigo-50/60 p-6 shadow-sm backdrop-blur"
      data-testid="workbench-header"
    >
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-brand-600">
            {t('eyebrow')}
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {context.application.requestTitle}
          </h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 font-medium text-slate-700">
            {t('applicationStatus')}:{' '}
            <span className="text-slate-900">{context.application.status}</span>
          </span>
          {connection ? (
            <span
              className="rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 font-medium text-emerald-700"
              data-testid="workbench-model"
            >
              {connection.name}
              {connection.modelId ? ` · ${connection.modelId}` : ''}
              {' · '}
              {connection.provider}
            </span>
          ) : (
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-slate-500">
              {t('noModel')}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function ResultCard({ result }: { result: WorkbenchCallResult }) {
  const t = useTranslations('trainer.workbench');
  const ok = result.status >= 200 && result.status < 300 && !result.errorMessage;
  return (
    <section
      className="card space-y-3"
      data-testid="workbench-result"
      data-ok={ok ? 'true' : 'false'}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('result.title')}
        </h2>
        <div className="flex items-center gap-2 text-[11px] font-medium">
          <span
            className={`rounded-full px-2 py-0.5 ${
              ok
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {result.status || '—'}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
            {result.latencyMs}ms
          </span>
          {result.tokensIn != null ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">
              in:{result.tokensIn}
            </span>
          ) : null}
          {result.tokensOut != null ? (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-700">
              out:{result.tokensOut}
            </span>
          ) : null}
        </div>
      </header>

      {result.outputText ? (
        <pre
          className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-800"
          data-testid="workbench-output"
        >
          {result.outputText}
        </pre>
      ) : null}

      {result.errorMessage ? (
        <p className="text-xs text-rose-600">{result.errorMessage}</p>
      ) : null}

      <details className="group text-xs text-slate-500">
        <summary className="cursor-pointer select-none text-slate-600 hover:text-slate-900">
          {t('result.raw')}
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-slate-50/70 p-3 font-mono text-[11px] leading-snug text-slate-700">
          {JSON.stringify(result.raw, null, 2)}
        </pre>
      </details>
    </section>
  );
}

function HistoryCard({ history }: { history: PublicModelCall[] }) {
  const t = useTranslations('trainer.workbench');
  if (history.length === 0) {
    return (
      <section className="card text-sm text-slate-500" data-testid="workbench-history-empty">
        {t('history.empty')}
      </section>
    );
  }
  return (
    <section className="card space-y-3" data-testid="workbench-history">
      <h2 className="text-base font-semibold text-slate-900">{t('history.title')}</h2>
      <ul className="space-y-2">
        {history.map((call) => (
          <li
            key={call.id}
            className="rounded-xl border border-slate-200/70 bg-white/60 p-3"
            data-testid={`workbench-history-${call.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">{call.operation}</span>
              <span className="font-mono">
                {new Date(call.createdAt).toLocaleString()}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 ${
                  call.responseStatus && call.responseStatus >= 200 && call.responseStatus < 300
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {call.responseStatus ?? '—'}
              </span>
              {call.latencyMs != null ? (
                <span className="text-slate-500">{call.latencyMs}ms</span>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {t('history.requestPreview')}
                </p>
                <p className="mt-0.5 line-clamp-3 text-slate-700">
                  {call.requestPreview || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {t('history.responsePreview')}
                </p>
                <p className="mt-0.5 line-clamp-3 text-slate-700">
                  {call.responsePreview || '—'}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------------- */

function buildPayload(
  operation: ModelCallOperation,
  systemText: string,
  userText: string,
  temperatureRaw: string,
  maxTokensRaw: string,
): WorkbenchCallInput {
  const temperature = parseNumber(temperatureRaw);
  const maxTokens = parseInt(maxTokensRaw);
  const payload: WorkbenchCallInput = {
    operation,
    ...(temperature != null ? { temperature } : {}),
    ...(maxTokens != null ? { maxTokens } : {}),
  };
  if (operation === 'EMBED') {
    payload.input = userText;
    return payload;
  }
  if (operation === 'COMPLETE') {
    payload.prompt = userText;
    return payload;
  }
  const messages: WorkbenchMessage[] = [];
  if (systemText.trim().length > 0) {
    messages.push({ role: 'system', content: systemText });
  }
  messages.push({ role: 'user', content: userText });
  payload.messages = messages;
  return payload;
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseFloat(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : null;
}

function BlockedReason({ reason }: { reason: string }) {
  const t = useTranslations('trainer.workbench.reasons');
  if (reason.includes('no model')) return <>{t('noModel')}</>;
  if (reason.includes('disabled')) return <>{t('disabled')}</>;
  if (reason.includes('not been activated')) return <>{t('inactive')}</>;
  if (reason.includes('shortlists')) return <>{t('notShortlisted')}</>;
  return <>{reason}</>;
}

