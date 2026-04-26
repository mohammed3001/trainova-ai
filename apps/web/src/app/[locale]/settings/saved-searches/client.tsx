'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface SavedSearch {
  id: string;
  name: string;
  queryJson: {
    q?: string;
    industry?: string;
    skill?: string;
    modelFamily?: string;
  };
  notifyDaily: boolean;
  lastNotifiedAt: string | null;
  createdAt: string;
}

interface Labels {
  name: string;
  query: string;
  industry: string;
  notify: string;
  create: string;
  delete: string;
  empty: string;
  notifyOn: string;
  notifyOff: string;
  saving: string;
  deleting: string;
  createError: string;
  updateError: string;
  deleteError: string;
}

interface Props {
  initial: SavedSearch[];
  labels: Labels;
}

/**
 * Saved-searches admin surface for the signed-in user. Uses the
 * Next.js API proxy (`/api/proxy/...`) to keep the JWT in
 * the HTTP-only cookie — no token leaves the server boundary.
 *
 * Optimistic updates are deliberately avoided: each mutation hits the
 * server, then the page is `router.refresh()`ed to re-pull the canonical
 * list. The list is short (≤ 25 rows) so a full refresh is cheap and
 * dodges the consistency bugs that come with diff-merging.
 */
export function SavedSearchesClient({ initial, labels }: Props) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [notify, setNotify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        name: name.trim(),
        query: {
          ...(q.trim() ? { q: q.trim() } : {}),
          ...(industry.trim() ? { industry: industry.trim() } : {}),
        },
        notifyDaily: notify,
      };
      const res = await fetch('/api/proxy/saved-searches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(labels.createError);
      const created = (await res.json()) as SavedSearch;
      setItems((prev) => [created, ...prev]);
      setName('');
      setQ('');
      setIndustry('');
      setNotify(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.createError);
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotify(row: SavedSearch) {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/saved-searches/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyDaily: !row.notifyDaily }),
      });
      if (!res.ok) throw new Error(labels.updateError);
      setItems((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, notifyDaily: !r.notifyDaily } : r)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.updateError);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/saved-searches/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error(labels.deleteError);
      setItems((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : labels.deleteError);
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
      >
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700 dark:text-slate-200">{labels.name}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700 dark:text-slate-200">{labels.query}</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              maxLength={200}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700 dark:text-slate-200">
              {labels.industry}
            </span>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              maxLength={80}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
            />
          </label>
        </div>
        <label className="mt-3 inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span className="text-slate-700 dark:text-slate-200">{labels.notify}</span>
        </label>
        <div className="mt-4 flex items-center justify-between">
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="ml-auto rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {busy ? labels.saving : labels.create}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
          {labels.empty}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((row) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{row.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {[
                    row.queryJson.q,
                    row.queryJson.industry,
                    row.queryJson.skill,
                    row.queryJson.modelFamily,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleNotify(row)}
                  className={`rounded border px-2 py-1 text-xs font-medium ${
                    row.notifyDaily
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200'
                      : 'border-slate-300 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  {row.notifyDaily ? labels.notifyOn : labels.notifyOff}
                </button>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                >
                  {labels.delete}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
