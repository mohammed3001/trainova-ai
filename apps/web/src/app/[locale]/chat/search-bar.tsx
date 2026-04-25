'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MessageSearchHit } from '@/lib/chat-api';

/**
 * Cross-conversation message search shown above the conversation list.
 *
 * The query runs against `/chat/messages/search`, which the API scopes to
 * the caller's conversations only — there's no risk of leaking other
 * users' messages even with a noisy query. We debounce 300ms and cap
 * results at 20 to keep the dropdown legible. Each hit links into the
 * conversation rather than scrolling to the message itself; deep-linking
 * to a message id is a follow-up because it requires server-side cursor
 * pagination.
 */
export function ChatSearchBar({ locale }: { locale: string }) {
  const t = useTranslations('chat');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MessageSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      // Race-guard: only the most recent in-flight request mutates state.
      // Without this, fast typing can leave a stale earlier response
      // overwriting the current one when the network is choppy.
      const myId = ++reqIdRef.current;
      try {
        const res = await fetch(
          `/api/proxy/chat/messages/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as { items: MessageSearchHit[] };
        if (myId === reqIdRef.current) setItems(json.items);
      } catch {
        if (myId === reqIdRef.current) setItems([]);
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        type="search"
        className="input h-10 w-full"
        placeholder={t('hub.searchPlaceholder')}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid="chat-search-input"
        aria-label={t('hub.searchPlaceholder')}
      />
      {open && q.trim().length >= 2 ? (
        <div
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
          data-testid="chat-search-results"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-slate-400">{t('hub.searching')}</p>
          ) : items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">{t('hub.noResults')}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={`/${locale}/chat/${it.conversationId}`}
                    className="block px-3 py-2 hover:bg-slate-50"
                    data-testid={`chat-search-hit-${it.id}`}
                  >
                    <p className="line-clamp-2 text-xs text-slate-700">
                      {highlight(it.body, q.trim())}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {it.sender?.name ?? ''} ·{' '}
                      {new Date(it.createdAt).toLocaleString(
                        locale === 'ar' ? 'ar' : 'en',
                      )}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function highlight(text: string, q: string) {
  // Naïve case-insensitive split for the inline highlight. We avoid a
  // RegExp because the query is user-controlled and we don't want to
  // pay the regex-escape tax for every render.
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const out: Array<string | JSX.Element> = [];
  let cursor = 0;
  let idx = lower.indexOf(needle, cursor);
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) out.push(text.slice(cursor, idx));
    out.push(
      <mark
        key={key++}
        className="rounded bg-amber-100 px-0.5 text-slate-900"
      >
        {text.slice(idx, idx + needle.length)}
      </mark>,
    );
    cursor = idx + needle.length;
    idx = lower.indexOf(needle, cursor);
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}
