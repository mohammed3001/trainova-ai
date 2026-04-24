'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  MODEL_PROVIDERS,
  MODEL_AUTH_KINDS,
  type ModelConnectionInput,
  type ModelConnectionTestResult,
  type ModelProvider,
  type ModelAuthKind,
  type PublicModelConnection,
} from '@trainova/shared';

/* ============================================================================
 * Proxy helper — all traffic goes through /api/proxy so the httpOnly auth
 * cookie is attached server-side. We never call the API host directly from a
 * client component.
 * ========================================================================== */
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

/* ============================================================================ */

interface Props {
  companyId: string;
  initial: PublicModelConnection[];
  locale: string;
}

export function ModelsClient({ companyId, initial, locale: _locale }: Props) {
  const t = useTranslations('company.models');
  const [rows, setRows] = useState<PublicModelConnection[]>(initial);
  const [editing, setEditing] = useState<PublicModelConnection | 'new' | null>(null);
  const [testing, setTesting] = useState<Record<string, ModelConnectionTestResult | 'loading'>>({});
  const [topError, setTopError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await proxyJson<PublicModelConnection[]>(
      `/companies/${companyId}/models`,
    );
    setRows(list);
  }, [companyId]);

  const handleCreate = useCallback(
    async (input: ModelConnectionInput) => {
      setTopError(null);
      await proxyJson(`/companies/${companyId}/models`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await refresh();
      setEditing(null);
    },
    [companyId, refresh],
  );

  const handleUpdate = useCallback(
    async (id: string, patch: Partial<ModelConnectionInput>) => {
      setTopError(null);
      await proxyJson(`/models/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await refresh();
      setEditing(null);
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm(t('confirmDelete'))) return;
      try {
        await proxyJson(`/models/${id}`, { method: 'DELETE' });
        await refresh();
      } catch (e) {
        setTopError(errorMessage(e));
      }
    },
    [refresh, t],
  );

  const handleTest = useCallback(
    async (id: string) => {
      setTesting((prev) => ({ ...prev, [id]: 'loading' }));
      try {
        const result = await proxyJson<ModelConnectionTestResult>(
          `/models/${id}/test`,
          { method: 'POST' },
        );
        setTesting((prev) => ({ ...prev, [id]: result }));
        await refresh();
      } catch (e) {
        setTesting((prev) => ({
          ...prev,
          [id]: { ok: false, latencyMs: null, error: errorMessage(e) },
        }));
      }
    },
    [refresh],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 ring-1 ring-white/10 transition hover:shadow-indigo-500/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          data-testid="add-model-connection"
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <PlusIcon />
          {t('add')}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('helper')}</p>
      </div>

      {topError ? (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
        >
          {topError}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <ModelCard
              key={row.id}
              row={row}
              testState={testing[row.id]}
              onEdit={() => setEditing(row)}
              onTest={() => void handleTest(row.id)}
              onDelete={() => void handleDelete(row.id)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <EditorDrawer
          value={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (input, id) => {
            try {
              if (id) await handleUpdate(id, input);
              else await handleCreate(input);
            } catch (e) {
              setTopError(errorMessage(e));
              throw e;
            }
          }}
        />
      ) : null}
    </div>
  );
}

/* ========================================================================== */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('company.models');
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-violet-50/40 p-10 text-center shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
      <div className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-gradient-to-br from-violet-500/20 via-indigo-500/10 to-sky-500/20 blur-3xl" />
      <div className="relative mx-auto max-w-md space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-sky-500 text-white shadow-lg shadow-indigo-500/20">
          <PlugIcon />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {t('empty.title')}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t('empty.body')}</p>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary mt-2 inline-flex items-center gap-2"
        >
          <PlusIcon />
          {t('add')}
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== */

function ModelCard({
  row,
  testState,
  onEdit,
  onTest,
  onDelete,
}: {
  row: PublicModelConnection;
  testState: ModelConnectionTestResult | 'loading' | undefined;
  onEdit: () => void;
  onTest: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('company.models');
  const tProvider = useTranslations('company.models.providers');

  const status = row.status;
  const lastOk = row.lastCheckOk;

  return (
    <article
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900/60"
      data-testid="model-connection-card"
      data-status={status}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br from-violet-500/10 to-sky-500/10 blur-2xl opacity-0 transition group-hover:opacity-100" />

      <header className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <StatusDot status={status} />
            <span className="truncate text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {tProvider(row.provider)}
            </span>
          </div>
          <h3 className="truncate text-base font-semibold text-slate-900 dark:text-white">
            {row.name}
          </h3>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {t(`status.${status}`)}
        </span>
      </header>

      <dl className="relative space-y-1 text-xs text-slate-600 dark:text-slate-400">
        {row.modelId ? (
          <Row label={t('fields.modelId')} value={row.modelId} mono />
        ) : null}
        {row.endpointUrl ? (
          <Row label={t('fields.endpointUrl')} value={row.endpointUrl} mono />
        ) : null}
        {row.region ? <Row label={t('fields.region')} value={row.region} /> : null}
        <Row
          label={t('fields.credentials')}
          value={row.hasCredentials ? (row.credentialsPreview ?? '•••') : t('fields.none')}
          mono={row.hasCredentials}
        />
        {row.lastCheckedAt ? (
          <Row
            label={t('fields.lastChecked')}
            value={`${new Date(row.lastCheckedAt).toLocaleString()} · ${
              lastOk ? t('fields.ok') : t('fields.failed')
            }`}
          />
        ) : null}
        {row.lastCheckError ? (
          <div className="mt-2 rounded-md bg-rose-50 p-2 text-[11px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            {row.lastCheckError}
          </div>
        ) : null}
      </dl>

      {testState ? (
        <TestResultBanner state={testState} />
      ) : null}

      <footer className="relative mt-auto flex flex-wrap gap-2 pt-2">
        <button
          type="button"
          onClick={onTest}
          disabled={testState === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
          data-testid="test-model-connection"
        >
          <BoltIcon />
          {testState === 'loading' ? t('testing') : t('test')}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-slate-600"
        >
          <PencilIcon />
          {t('edit')}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-slate-900 dark:text-rose-300 dark:hover:border-rose-400"
        >
          <TrashIcon />
          {t('delete')}
        </button>
      </footer>
    </article>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right ${
          mono ? 'font-mono text-[11px]' : ''
        } text-slate-700 dark:text-slate-200`}
      >
        {value}
      </dd>
    </div>
  );
}

function StatusDot({ status }: { status: PublicModelConnection['status'] }) {
  const color =
    status === 'ACTIVE'
      ? 'from-emerald-400 to-teal-500'
      : status === 'DRAFT'
        ? 'from-amber-400 to-orange-500'
        : 'from-slate-400 to-slate-500';
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      <span
        className={`absolute inline-flex h-full w-full rounded-full bg-gradient-to-br ${color} opacity-75 ${
          status === 'ACTIVE' ? 'animate-ping' : ''
        }`}
      />
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full bg-gradient-to-br ${color}`} />
    </span>
  );
}

function TestResultBanner({
  state,
}: {
  state: ModelConnectionTestResult | 'loading';
}) {
  const t = useTranslations('company.models');
  if (state === 'loading') {
    return (
      <div className="relative rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          {t('testingLive')}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`relative rounded-lg p-3 text-xs ${
        state.ok
          ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'
          : 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200'
      }`}
      data-testid="test-result"
      data-ok={state.ok ? 'true' : 'false'}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">
          {state.ok ? t('result.ok') : t('result.fail')}
        </span>
        {state.latencyMs != null ? (
          <span className="font-mono text-[10px] opacity-80">{state.latencyMs}ms</span>
        ) : null}
      </div>
      {state.detail ? <div className="mt-1 opacity-80">{state.detail}</div> : null}
      {state.error ? <div className="mt-1 opacity-80">{state.error}</div> : null}
    </div>
  );
}

/* ========================================================================== */

interface EditorProps {
  value: PublicModelConnection | null;
  onClose: () => void;
  onSave: (input: ModelConnectionInput, id?: string) => Promise<void>;
}

function EditorDrawer({ value, onClose, onSave }: EditorProps) {
  const t = useTranslations('company.models');
  const tProvider = useTranslations('company.models.providers');
  const tAuth = useTranslations('company.models.auth');

  const [name, setName] = useState(value?.name ?? '');
  const [provider, setProvider] = useState<ModelProvider>(value?.provider ?? 'OPENAI_COMPATIBLE');
  const [endpointUrl, setEndpointUrl] = useState(value?.endpointUrl ?? '');
  const [modelId, setModelId] = useState(value?.modelId ?? '');
  const [region, setRegion] = useState(value?.region ?? '');
  const [authKind, setAuthKind] = useState<ModelAuthKind>(
    (value?.authKind as ModelAuthKind | undefined) ?? 'api_key',
  );
  const [credentials, setCredentials] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsEndpoint = useMemo(
    () => provider !== 'ANTHROPIC' && provider !== 'BEDROCK',
    [provider],
  );
  const needsRegion = provider === 'BEDROCK';

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const input: ModelConnectionInput = {
        name: name.trim(),
        provider,
        endpointUrl: needsEndpoint && endpointUrl ? endpointUrl.trim() : undefined,
        modelId: modelId.trim() || undefined,
        region: needsRegion && region ? region.trim() : undefined,
        authKind,
        // On edit: empty string = keep existing. Non-empty = replace.
        credentials: credentials ? credentials : value ? undefined : undefined,
        metadata: {},
      };
      await onSave(input, value?.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-end sm:items-center sm:justify-center"
    >
      <button
        type="button"
        aria-label={t('editor.dismiss')}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-3xl sm:border"
        data-testid="model-editor"
      >
        <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 px-6 py-4 dark:border-slate-800 dark:from-violet-500/10 dark:via-slate-900 dark:to-sky-500/10">
          <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-gradient-to-br from-violet-500/20 to-sky-500/20 blur-2xl" />
          <h2 className="relative text-lg font-semibold text-slate-900 dark:text-white">
            {value ? t('editor.editTitle') : t('editor.newTitle')}
          </h2>
          <p className="relative text-xs text-slate-500 dark:text-slate-400">
            {t('editor.subtitle')}
          </p>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Field label={t('fields.name')} required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
              maxLength={80}
              autoFocus
            />
          </Field>

          <Field label={t('fields.provider')} required>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as ModelProvider)}
              className="input"
            >
              {MODEL_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {tProvider(p)}
                </option>
              ))}
            </select>
          </Field>

          {needsEndpoint ? (
            <Field label={t('fields.endpointUrl')} required>
              <input
                type="url"
                value={endpointUrl}
                onChange={(e) => setEndpointUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
                className="input font-mono text-xs"
                required
              />
            </Field>
          ) : null}

          {needsRegion ? (
            <Field label={t('fields.region')} required>
              <input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className="input font-mono text-xs"
                required
              />
            </Field>
          ) : null}

          <Field label={t('fields.modelId')}>
            <input
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              placeholder={t('fields.modelIdPlaceholder')}
              className="input font-mono text-xs"
            />
          </Field>

          <Field label={t('fields.authKind')}>
            <select
              value={authKind}
              onChange={(e) => setAuthKind(e.target.value as ModelAuthKind)}
              className="input"
            >
              {MODEL_AUTH_KINDS.map((k) => (
                <option key={k} value={k}>
                  {tAuth(k)}
                </option>
              ))}
            </select>
          </Field>

          {authKind !== 'none' ? (
            <Field
              label={
                value?.hasCredentials
                  ? t('fields.credentialsUpdate')
                  : t('fields.credentials')
              }
              hint={
                value?.hasCredentials
                  ? t('fields.credentialsUpdateHint', { preview: value.credentialsPreview ?? '' })
                  : t('fields.credentialsHint')
              }
              required={!value?.hasCredentials}
            >
              <input
                type="password"
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                className="input font-mono text-xs"
                autoComplete="off"
                required={!value?.hasCredentials}
              />
            </Field>
          ) : null}

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t('editor.cancel')}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md disabled:opacity-50"
            data-testid="model-editor-submit"
          >
            {pending ? <Spinner /> : null}
            {value ? t('editor.save') : t('editor.create')}
          </button>
        </footer>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="label">
        {label}
        {required ? <span className="text-rose-500"> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="block text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>
      ) : null}
    </label>
  );
}

/* ========================================================================== */

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/* -- icons ----------------------------------------------------------------- */

function PlusIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M13 2 3 14h7l-1 8 10-12h-7z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5 20.5 7.5 7 21H3v-4z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 2v4M15 2v4" />
      <path d="M5 6h14v5a7 7 0 0 1-14 0z" />
      <path d="M12 18v4" />
    </svg>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
  );
}
