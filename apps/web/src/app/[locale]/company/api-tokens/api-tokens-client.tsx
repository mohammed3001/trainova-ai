'use client';

import { useState } from 'react';
import {
  ApiTokenScopes,
  type ApiTokenDto,
  type ApiTokenScope,
  type CreatedApiTokenDto,
} from '@trainova/shared';

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

interface Props {
  initial: ApiTokenDto[];
}

interface FormState {
  name: string;
  scopes: ApiTokenScope[];
  rateLimitPerMinute: number;
  expiresAt: string; // datetime-local; empty == no expiry
}

const emptyForm: FormState = {
  name: '',
  scopes: [],
  rateLimitPerMinute: 60,
  expiresAt: '',
};

/**
 * Client-side token CRUD. Issuance returns the raw token exactly once —
 * we surface it in a banner the operator must dismiss explicitly so it
 * isn't lost to an accidental refresh.
 */
export function ApiTokensClient({ initial }: Props) {
  const [tokens, setTokens] = useState<ApiTokenDto[]>(initial);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<CreatedApiTokenDto | null>(null);

  function toggleScope(scope: ApiTokenScope) {
    setForm((f) =>
      f.scopes.includes(scope)
        ? { ...f, scopes: f.scopes.filter((s) => s !== scope) }
        : { ...f, scopes: [...f.scopes, scope] },
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.scopes.length === 0) {
      setError('Pick at least one scope.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const created = await proxyJson<CreatedApiTokenDto>('/company/api-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          scopes: form.scopes,
          rateLimitPerMinute: form.rateLimitPerMinute,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : null,
        }),
      });
      setRevealed(created);
      // Strip the secret half before persisting in the listing.
      const { token: _token, ...meta } = created;
      void _token;
      setTokens((list) => [meta, ...list]);
      setForm(emptyForm);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm('Revoke this token? Active integrations will start failing.')) return;
    try {
      const updated = await proxyJson<ApiTokenDto>(`/company/api-tokens/${id}`, {
        method: 'DELETE',
      });
      setTokens((list) => list.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    }
  }

  return (
    <div className="space-y-8">
      {revealed && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">
            Copy your token now &mdash; it won&rsquo;t be shown again
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Store this in your secret manager and treat it like a password.
          </p>
          <pre className="mt-3 overflow-x-auto rounded bg-white p-3 font-mono text-xs text-slate-900">
            {revealed.token}
          </pre>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="mt-3 rounded bg-amber-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
          >
            I&rsquo;ve copied it
          </button>
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-slate-900">Create a token</h2>
        <div>
          <label className="block text-sm font-medium text-slate-700">Name</label>
          <input
            required
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Production sync"
            className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <fieldset>
          <legend className="block text-sm font-medium text-slate-700">Scopes</legend>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ApiTokenScopes.map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.scopes.includes(scope)}
                  onChange={() => toggleScope(scope)}
                />
                <code className="text-xs">{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Rate limit (req/min)
            </label>
            <input
              type="number"
              min={1}
              max={600}
              value={form.rateLimitPerMinute}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  rateLimitPerMinute: Number(e.target.value) || 60,
                }))
              }
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Expires (optional)
            </label>
            <input
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm((f) => ({ ...f, expiresAt: e.target.value }))}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {creating ? 'Creating…' : 'Create token'}
        </button>
      </form>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Existing tokens ({tokens.length})
        </h2>
        {tokens.length === 0 ? (
          <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No tokens yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tokens.map((t) => (
              <li
                key={t.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {t.prefix}…
                    </code>
                    {t.active ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700">
                        {t.revokedAt ? 'Revoked' : 'Expired'}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 text-xs text-slate-500">
                    {t.scopes.map((s) => (
                      <code key={s} className="rounded bg-slate-100 px-1.5 py-0.5">
                        {s}
                      </code>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {t.rateLimitPerMinute} req/min · last used{' '}
                    {t.lastUsedAt
                      ? new Date(t.lastUsedAt).toLocaleString()
                      : 'never'}
                    {t.expiresAt
                      ? ` · expires ${new Date(t.expiresAt).toLocaleDateString()}`
                      : ''}
                  </p>
                </div>
                {t.active && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(t.id)}
                    className="rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
