export type NotificationType =
  | 'application.received'
  | 'application.shortlisted'
  | 'application.accepted'
  | 'application.rejected'
  | 'test.assigned'
  | 'test.submitted'
  | 'test.graded'
  | 'chat.message'
  | 'system.announcement';

export interface NotificationPayload {
  title: string;
  body?: string;
  href?: string;
  meta?: Record<string, unknown>;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  payload: NotificationPayload;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
}

// These helpers are consumed by the `'use client'` notifications bell, so
// they must route through the Next.js proxy route handler (which forwards
// the auth cookie server-side) rather than `authedFetch`, which reads
// `cookies()` from `next/headers` and would throw in the browser.
export async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new Error(`request failed (${res.status}): ${body}`);
  }
  return (await res.json()) as T;
}

export function listNotifications(params: { limit?: number; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  const qs = q.toString();
  return proxyJson<NotificationList>(`/notifications${qs ? `?${qs}` : ''}`);
}

export function unreadNotificationCount() {
  return proxyJson<{ count: number }>(`/notifications/unread-count`);
}

export function markAllNotificationsRead() {
  return proxyJson<{ ok: true; updated: number }>(`/notifications/read-all`, {
    method: 'POST',
  });
}

export function markNotificationRead(id: string) {
  return proxyJson<{ ok: boolean }>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}
