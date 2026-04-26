'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api';

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  description: string | null;
  enabled: boolean;
  failureCount: number;
  disabledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateResponse extends WebhookRow {
  secret: string;
}

interface Props {
  initial: WebhookRow[];
  events: string[];
}

/**
 * Minimal company-side config UI for Webhooks v1. Surface goals:
 *   • register a new endpoint (URL + subscribed events) and reveal the
 *     signing secret exactly once;
 *   • disable / delete an existing endpoint;
 *   • show health (failure count, auto-disabled banner).
 *
 * Delivery log + redelivery are intentionally deferred to a follow-up
 * PR — the underlying API endpoints exist (`GET /company/webhooks/:id/deliveries`,
 * `POST /.../redeliver`) so the UI can be added without a backend round-trip.
 */
export function WebhooksClient({ initial, events }: Props) {
  const router = useRouter();
  const t = useTranslations('integrations.webhooks');
  const [rows, setRows] = useState<WebhookRow[]>(initial);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    url: '',
    description: '',
    selected: new Set<string>(),
  });
  const [revealed, setRevealed] = useState<{ id: string; secret: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (e: string) => {
    setForm((f) => {
      const next = new Set(f.selected);
      if (next.has(e)) next.delete(e);
      else next.add(e);
      return { ...f, selected: next };
    });
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const created = await apiFetch<CreateResponse>('/company/webhooks', {
          method: 'POST',
          body: JSON.stringify({
            url: form.url,
            // [] means "all events" on the backend — keep parity here.
            events: Array.from(form.selected),
            description: form.description || undefined,
          }),
        });
        setRows((rs) => [
          {
            id: created.id,
            url: created.url,
            events: created.events,
            description: created.description,
            enabled: created.enabled,
            failureCount: 0,
            disabledAt: null,
            createdAt: created.createdAt,
            updatedAt: created.createdAt,
          },
          ...rs,
        ]);
        setRevealed({ id: created.id, secret: created.secret });
        setForm({ url: '', description: '', selected: new Set() });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create webhook');
      }
    });
  };

  const setEnabled = (row: WebhookRow, enabled: boolean) => {
    startTransition(async () => {
      try {
        const next = await apiFetch<WebhookRow>(`/company/webhooks/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ enabled }),
        });
        setRows((rs) => rs.map((r) => (r.id === row.id ? next : r)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update webhook');
      }
    });
  };

  const remove = (row: WebhookRow) => {
    if (!confirm(t('confirmDelete'))) return;
    startTransition(async () => {
      try {
        await apiFetch(`/company/webhooks/${row.id}`, { method: 'DELETE' });
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete webhook');
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border p-4">
        <h2 className="mb-2 text-lg font-semibold">{t('createTitle')}</h2>
        <p className="mb-3 text-sm text-muted-foreground">{t('createHint')}</p>
        <div className="space-y-3">
          <label className="block text-sm">
            {t('urlLabel')}
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/webhooks/trainova"
              className="mt-1 w-full rounded border px-3 py-2"
              required
            />
          </label>
          <label className="block text-sm">
            {t('descriptionLabel')}
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="mt-1 w-full rounded border px-3 py-2"
              maxLength={200}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">{t('eventsLabel')}</legend>
            <p className="mb-2 text-xs text-muted-foreground">{t('eventsHint')}</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {events.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.selected.has(e)}
                    onChange={() => toggleEvent(e)}
                  />
                  <span className="font-mono">{e}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending || !form.url}
            className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? t('saving') : t('createSubmit')}
          </button>
        </div>
      </section>

      {revealed && (
        <section
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
          role="alert"
        >
          <h2 className="mb-2 text-lg font-semibold">{t('secretRevealedTitle')}</h2>
          <p className="mb-2 text-sm">{t('secretRevealedHint')}</p>
          <code className="block break-all rounded bg-background p-2 font-mono text-xs">
            {revealed.secret}
          </code>
          <button
            type="button"
            onClick={() => setRevealed(null)}
            className="mt-2 rounded border px-3 py-1 text-xs"
          >
            {t('dismiss')}
          </button>
        </section>
      )}

      <section className="rounded-lg border">
        <h2 className="border-b px-4 py-2 text-lg font-semibold">{t('listTitle')}</h2>
        {rows.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-sm">{row.url}</p>
                    {row.description && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.events.length === 0
                        ? t('subscribeAll')
                        : row.events.join(', ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEnabled(row, !row.enabled)}
                      disabled={pending}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      {row.enabled ? t('disable') : t('enable')}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(row)}
                      disabled={pending}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                    >
                      {t('delete')}
                    </button>
                  </div>
                </div>
                {!row.enabled && row.disabledAt && (
                  <p className="text-xs text-amber-700">
                    {t('autoDisabled', {
                      count: row.failureCount,
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
