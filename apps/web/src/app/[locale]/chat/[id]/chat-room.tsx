'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Socket } from 'socket.io-client';
import { getChatSocket } from '@/lib/chat-socket';
import type { ChatMessage } from '@/lib/chat-api';
import { TemplatesPicker } from './templates-picker';
import { AiPanel } from './ai-panel';

interface Props {
  conversationId: string;
  currentUserId: string;
  otherName: string;
  otherRole: string;
  initialMessages: ChatMessage[];
  /** Last time the *other* participant marked the conversation as read.
   *  Drives the per-message ✓ / ✓✓ seen indicator on outgoing bubbles. */
  initialOtherLastReadAt: string | null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function formatTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(locale === 'ar' ? 'ar' : 'en', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatRoom({
  conversationId,
  currentUserId,
  otherName,
  otherRole,
  initialMessages,
  initialOtherLastReadAt,
}: Props) {
  const locale = useLocale();
  const t = useTranslations('chat');
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [connected, setConnected] = useState(false);
  // Mirror of the other participant's `lastReadAt` from the server. Updated
  // live by the gateway's `read:update` event so my outgoing bubbles flip
  // from ✓ to ✓✓ as soon as they're acknowledged. We keep it as ISO string
  // (not Date) because the websocket payload is a string and rolling up the
  // type at the boundary keeps comparisons consistent.
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(
    initialOtherLastReadAt,
  );
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const roleLabel = otherRole
    ? t(`role.${otherRole}` as 'role.TRAINER')
    : '';

  // Subscribe to real-time updates.
  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    // The socket is a shared singleton (see chat-socket.ts), so we have to
    // remove listeners by reference in cleanup — `socket.off('event')` with
    // no handler would wipe every listener for that event across the app,
    // which would silently break any other mounted chat-aware surface
    // (e.g. the header unread badge).
    const onConnect = () => {
      setConnected(true);
      socket?.emit('conversation:join', { conversationId });
    };
    const onDisconnect = () => setConnected(false);
    const onMessage = (m: ChatMessage) => {
      if (m.conversationId !== conversationId) return;
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      // Opportunistically mark read since we're looking at the thread.
      if (m.senderId !== currentUserId) void markRead(conversationId);
    };
    const onTyping = ({
      conversationId: cid,
      userId,
      typing,
    }: {
      conversationId: string;
      userId: string;
      typing: boolean;
    }) => {
      if (cid !== conversationId || userId === currentUserId) return;
      setOtherTyping(typing);
    };
    const onRead = ({
      conversationId: cid,
      userId,
      lastReadAt,
    }: {
      conversationId: string;
      userId: string;
      lastReadAt: string;
    }) => {
      // Only bump on the *other* participant's read marker. Our own
      // markRead bursts on every new message and would otherwise cause
      // pointless re-renders.
      if (cid !== conversationId || userId === currentUserId) return;
      setOtherLastReadAt((prev) =>
        prev && prev >= lastReadAt ? prev : lastReadAt,
      );
    };

    (async () => {
      try {
        socket = await getChatSocket();
        if (cancelled) return;
        socketRef.current = socket;
        setConnected(socket.connected);
        // Server-side Socket.IO room memberships are dropped on disconnect,
        // so we must rejoin `conv:${conversationId}` every time the socket
        // comes back — otherwise message:new/typing/presence silently stop
        // arriving after a network blip even though the green "Live" dot
        // lights back up.
        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('message:new', onMessage);
        socket.on('typing', onTyping);
        socket.on('read:update', onRead);
        socket.emit('conversation:join', { conversationId });
      } catch (e) {
        // Realtime unavailable; UI still works via REST.
        console.warn('chat socket init failed', e);
      }
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.emit('conversation:leave', { conversationId });
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('message:new', onMessage);
        socket.off('typing', onTyping);
        socket.off('read:update', onRead);
      }
    };
  }, [conversationId, currentUserId]);

  // Mark read on open + whenever a new message arrives while visible.
  useEffect(() => {
    void markRead(conversationId);
  }, [conversationId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, otherTyping]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, body }),
      });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt || t('room.sendFailed'));
        setSending(false);
        return;
      }
      const created = (await res.json()) as ChatMessage;
      setMessages((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
      setDraft('');
      setSending(false);
      socketRef.current?.emit('typing:stop', { conversationId });
    } catch (e) {
      setError((e as Error).message || t('room.sendFailed'));
      setSending(false);
    }
  }, [conversationId, draft, sending, t]);

  const onInput = useCallback(
    (value: string) => {
      setDraft(value);
      const s = socketRef.current;
      if (!s) return;
      s.emit('typing:start', { conversationId });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        s.emit('typing:stop', { conversationId });
      }, 2000);
    },
    [conversationId],
  );

  const grouped = useMemo(() => groupByDay(messages, locale), [messages, locale]);

  return (
    <div className="glass flex h-[calc(100vh-14rem)] min-h-[28rem] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white/60 px-4 py-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-semibold text-white">
          {initials(otherName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900" data-testid="chat-other-name">
            {otherName}
          </p>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{roleLabel}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] ${connected ? 'text-emerald-600' : 'text-slate-400'}`}
          data-testid="chat-connected"
          data-connected={connected}
        >
          <span
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`}
          />
          {connected ? t('room.live') : t('room.offline')}
        </span>
      </div>

      {/* AI panel — collapsed by default; opt-in summary + task extraction. */}
      <AiPanel conversationId={conversationId} />

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50/60 to-white px-4 py-4"
        data-testid="chat-scroll"
      >
        {messages.length === 0 ? (
          <div className="mx-auto max-w-md py-12 text-center">
            <p className="text-sm text-slate-400">{t('room.emptyHint')}</p>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="sticky top-0 z-10 mb-2 flex justify-center">
                <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-0.5 text-[11px] text-slate-500 shadow-sm backdrop-blur">
                  {group.label}
                </span>
              </div>
              {group.items.map((m, i) => {
                const mine = m.senderId === currentUserId;
                const prev = group.items[i - 1];
                const showAvatar = !mine && prev?.senderId !== m.senderId;
                return (
                  <div
                    key={m.id}
                    className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`}
                    data-testid={`chat-msg-${m.id}`}
                    data-mine={mine}
                  >
                    {!mine ? (
                      <div className={`${showAvatar ? '' : 'invisible'} grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-slate-400 to-slate-500 text-[10px] font-semibold text-white`}>
                        {initials(m.sender?.name ?? otherName)}
                      </div>
                    ) : null}
                    <div className={`max-w-[72%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={mine ? 'chat-bubble-mine' : 'chat-bubble-theirs'}>
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      </div>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-slate-400">
                        {formatTime(m.createdAt, locale)}
                        {mine ? (
                          <span
                            aria-label={
                              otherLastReadAt && otherLastReadAt >= m.createdAt
                                ? t('room.seen')
                                : t('room.delivered')
                            }
                            data-testid={`chat-msg-receipt-${m.id}`}
                            data-seen={
                              otherLastReadAt && otherLastReadAt >= m.createdAt
                                ? 'true'
                                : 'false'
                            }
                            className={
                              otherLastReadAt && otherLastReadAt >= m.createdAt
                                ? 'text-brand-600'
                                : 'text-slate-400'
                            }
                          >
                            {otherLastReadAt && otherLastReadAt >= m.createdAt
                              ? '✓✓'
                              : '✓'}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {otherTyping ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500" data-testid="chat-typing">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span>{t('room.typing', { name: otherName })}</span>
          </div>
        ) : null}
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="border-t border-slate-200 bg-white/70 px-3 py-3"
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <TemplatesPicker
            onPick={(body) =>
              setDraft((prev) => (prev.length === 0 ? body : `${prev}\n${body}`))
            }
          />
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="input min-h-[44px] max-h-40 flex-1 resize-none"
            rows={1}
            placeholder={t('room.placeholder')}
            value={draft}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            data-testid="chat-input"
            disabled={sending}
          />
          <button
            type="submit"
            className="btn-primary h-11 shrink-0"
            disabled={sending || draft.trim().length === 0}
            data-testid="chat-send"
          >
            {sending ? t('room.sending') : t('room.send')}
          </button>
        </div>
        {error ? (
          <p className="mt-1.5 text-xs text-red-600" data-testid="chat-send-error">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

async function markRead(conversationId: string) {
  try {
    await fetch(`/api/proxy/chat/conversations/${conversationId}/read`, {
      method: 'PATCH',
    });
  } catch {
    // best-effort
  }
}

interface DayGroup {
  key: string;
  label: string;
  items: ChatMessage[];
}

function groupByDay(messages: ChatMessage[], locale: string): DayGroup[] {
  const out: DayGroup[] = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    // Group by local-date parts so the key stays aligned with the label
    // (which uses toLocaleDateString). A UTC-based key produces split
    // groups with identical labels for users in non-UTC timezones.
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const label = d.toLocaleDateString(locale === 'ar' ? 'ar' : 'en', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const last = out[out.length - 1];
    if (last && last.key === key) last.items.push(m);
    else out.push({ key, label, items: [m] });
  }
  return out;
}
