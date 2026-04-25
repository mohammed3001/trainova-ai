'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MessageTemplate } from '@/lib/chat-api';

/**
 * Composer affordance for inserting saved chat snippets.
 *
 * The picker fetches the caller's templates lazily the first time the
 * dropdown is opened — listing them on every chat-room mount would burn
 * a request even for users who never use templates. The "save current
 * draft" path is intentionally kept inside this component so the parent
 * composer doesn't need to know about templates at all; the parent only
 * sees `onPick(body)` when the user inserts one.
 */
export function TemplatesPicker({ onPick }: { onPick: (body: string) => void }) {
  const t = useTranslations('chat');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MessageTemplate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newBody, setNewBody] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/chat/templates');
      if (!res.ok) throw new Error(await res.text());
      setItems((await res.json()) as MessageTemplate[]);
    } catch (e) {
      setError((e as Error).message || t('templates.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  const create = useCallback(async () => {
    const name = newName.trim();
    const body = newBody.trim();
    if (!name || !body) return;
    setError(null);
    try {
      const res = await fetch('/api/proxy/chat/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, body }),
      });
      if (!res.ok) {
        // 409 → name collision; surface the server message verbatim so
        // the user knows to pick a different label.
        throw new Error(await res.text());
      }
      const created = (await res.json()) as MessageTemplate;
      setItems((prev) => [created, ...(prev ?? [])]);
      setNewName('');
      setNewBody('');
      setCreating(false);
    } catch (e) {
      setError((e as Error).message || t('templates.saveError'));
    }
  }, [newName, newBody, t]);

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/proxy/chat/templates/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error(await res.text());
        setItems((prev) => (prev ?? []).filter((x) => x.id !== id));
      } catch (e) {
        setError((e as Error).message || t('templates.deleteError'));
      }
    },
    [t],
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-brand-200 hover:text-brand-700"
        data-testid="chat-templates-toggle"
        aria-expanded={open}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-3.5 w-3.5"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
        </svg>
        {t('templates.toggle')}
      </button>

      {open ? (
        <div
          className="absolute bottom-full z-20 mb-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
          role="dialog"
          aria-label={t('templates.toggle')}
          data-testid="chat-templates-panel"
        >
          {loading ? (
            <p className="px-2 py-3 text-xs text-slate-400">{t('templates.loading')}</p>
          ) : items && items.length > 0 ? (
            <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-start gap-2 py-1.5"
                  data-testid={`chat-template-${it.id}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onPick(it.body);
                      setOpen(false);
                    }}
                    className="flex-1 rounded px-2 py-1 text-left hover:bg-slate-50"
                  >
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {it.name}
                    </p>
                    <p className="truncate text-[11px] text-slate-500">{it.body}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(it.id)}
                    className="text-[11px] text-slate-400 hover:text-red-600"
                    aria-label={t('templates.delete')}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-xs text-slate-400">{t('templates.empty')}</p>
          )}

          <div className="mt-2 border-t border-slate-100 pt-2">
            {creating ? (
              <div className="space-y-1.5">
                <input
                  className="input h-8 w-full text-xs"
                  placeholder={t('templates.namePlaceholder')}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  data-testid="chat-template-name"
                  maxLength={80}
                />
                <textarea
                  className="input min-h-[60px] w-full resize-none text-xs"
                  placeholder={t('templates.bodyPlaceholder')}
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  data-testid="chat-template-body"
                  rows={3}
                  maxLength={5000}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void create()}
                    className="btn-primary h-7 px-3 text-[11px]"
                    disabled={!newName.trim() || !newBody.trim()}
                    data-testid="chat-template-save"
                  >
                    {t('templates.save')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                      setNewBody('');
                      setError(null);
                    }}
                    className="text-[11px] text-slate-500 hover:text-slate-700"
                  >
                    {t('templates.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="text-[11px] font-medium text-brand-700 hover:text-brand-800"
                data-testid="chat-template-new"
              >
                + {t('templates.create')}
              </button>
            )}
            {error ? (
              <p className="mt-1 text-[11px] text-red-600">{error}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
