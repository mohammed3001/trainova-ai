'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import type { Socket } from 'socket.io-client';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
  type NotificationList,
  type NotificationType,
} from '@/lib/notifications-api';
import {
  getNotificationsSocket,
  type NotificationNewEvent,
} from '@/lib/notifications-socket';

type TypeLabels = Record<NotificationType, string>;

function relativeTime(iso: string, locale: string, t: ReturnType<typeof useTranslations>): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.round(diff / 60000);
  if (m < 1) return t('justNow');
  if (m < 60) return t('minutesAgo', { m });
  const h = Math.round(m / 60);
  if (h < 24) return t('hoursAgo', { h });
  const d = Math.round(h / 24);
  return t('daysAgo', { d });
}

function typeDot(type: NotificationType): string {
  // Keep the visual language AI-modern but strict: one semantic colour per
  // class of event. Mapped as utility classes so the gradient ring works in
  // both themes.
  switch (type) {
    case 'application.received':
    case 'application.shortlisted':
      return 'from-sky-400 to-blue-600';
    case 'application.accepted':
    case 'test.graded':
      return 'from-emerald-400 to-green-600';
    case 'application.rejected':
      return 'from-rose-400 to-red-600';
    case 'test.assigned':
    case 'test.submitted':
      return 'from-amber-400 to-orange-600';
    case 'chat.message':
      return 'from-violet-400 to-indigo-600';
    default:
      return 'from-slate-300 to-slate-500';
  }
}

interface Props {
  locale?: string;
  initialUnread?: number;
}

export function NotificationsBell({ locale: localeProp, initialUnread = 0 }: Props) {
  const locale = useLocale();
  const t = useTranslations('notifications');
  const tTypes = useTranslations('notifications.types');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState<number>(initialUnread);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const l = localeProp ?? locale;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: NotificationList = await listNotifications({ limit: 20 });
      setItems(data.items);
      setUnread(data.unreadCount);
      setLoaded(true);
    } catch {
      setError(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Socket subscription — kept alive while the bell is mounted so badge
  // updates in real time even when the popover is closed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getNotificationsSocket();
        if (cancelled) return;
        socketRef.current = s;
        s.on('notification:new', (n: NotificationNewEvent) => {
          // Dedupe against what's already buffered — the REST fetch and the
          // socket event race on first open, and we don't want the badge
          // to drift upward for a notification we already counted.
          setItems((prev) => {
            if (prev.some((x) => x.id === n.id)) return prev;
            setUnread((u) => u + 1);
            return [n, ...prev].slice(0, 50);
          });
        });
      } catch {
        /* silent — UI still works via REST */
      }
    })();
    return () => {
      cancelled = true;
      socketRef.current?.off('notification:new');
    };
  }, []);

  // Load on first open.
  useEffect(() => {
    if (open && !loaded && !loading) void fetchData();
  }, [open, loaded, loading, fetchData]);

  const handleMarkAll = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) => prev.map((x) => ({ ...x, readAt: x.readAt ?? now })));
      setUnread(0);
    } catch {
      /* ignore — user can retry */
    }
  }, []);

  const handleItemClick = useCallback(async (n: NotificationItem) => {
    if (!n.readAt) {
      try {
        await markNotificationRead(n.id);
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
  }, []);

  const labels = {
    'application.received': tTypes('application.received'),
    'application.shortlisted': tTypes('application.shortlisted'),
    'application.accepted': tTypes('application.accepted'),
    'application.rejected': tTypes('application.rejected'),
    'test.assigned': tTypes('test.assigned'),
    'test.submitted': tTypes('test.submitted'),
    'test.graded': tTypes('test.graded'),
    'chat.message': tTypes('chat.message'),
    'system.announcement': tTypes('system.announcement'),
  } satisfies TypeLabels;

  return (
    <div className="relative" ref={wrapRef} data-testid="notifications-bell-wrap">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost relative"
        aria-label={t('nav')}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="notifications-bell"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-5 w-5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 1 1-6 0" />
        </svg>
        <span className="sr-only">{t('nav')}</span>
        {unread > 0 ? (
          <span
            className="absolute -end-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-rose-600 px-1 text-[10px] font-semibold text-white shadow-sm ring-1 ring-white"
            data-testid="notifications-unread-badge"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={t('title')}
          className="absolute end-0 z-50 mt-2 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90 shadow-2xl backdrop-blur-lg ring-1 ring-slate-900/5"
          data-testid="notifications-panel"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-gradient-to-r from-indigo-50 via-white to-fuchsia-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{t('title')}</p>
              <p className="truncate text-[11px] text-slate-500">{t('subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="notifications-mark-all-read"
            >
              {t('markAllRead')}
            </button>
          </div>

          <div className="max-h-[26rem] overflow-y-auto" data-testid="notifications-list">
            {loading && !loaded ? (
              <p className="px-4 py-8 text-center text-xs text-slate-500">{t('loading')}</p>
            ) : error ? (
              <div className="px-4 py-8 text-center text-xs text-slate-600">
                <p className="mb-2">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchData()}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700"
                >
                  {t('retry')}
                </button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-slate-500" data-testid="notifications-empty">
                {t('empty')}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((n) => {
                  const href = n.payload?.href
                    ? n.payload.href.startsWith('/')
                      ? `/${l}${n.payload.href}`
                      : n.payload.href
                    : null;
                  const body = (
                    <div className="flex gap-3 px-4 py-3">
                      <span
                        aria-hidden
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-gradient-to-br ${typeDot(n.type)}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          {labels[n.type] ?? n.type}
                        </p>
                        <p className={`mt-0.5 text-sm ${n.readAt ? 'text-slate-600' : 'font-semibold text-slate-900'}`}>
                          {n.payload?.title ?? ''}
                        </p>
                        {n.payload?.body ? (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.payload.body}</p>
                        ) : null}
                        <p className="mt-1 text-[10px] text-slate-400">{relativeTime(n.createdAt, l, t)}</p>
                      </div>
                      {!n.readAt ? (
                        <span
                          aria-hidden
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-500"
                        />
                      ) : null}
                    </div>
                  );
                  return (
                    <li key={n.id} data-testid="notifications-item" data-read={n.readAt ? 'true' : 'false'}>
                      {href ? (
                        <Link
                          href={href}
                          onClick={() => void handleItemClick(n)}
                          className="block transition hover:bg-slate-50"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleItemClick(n)}
                          className="block w-full text-start transition hover:bg-slate-50"
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
