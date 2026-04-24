import { authedFetch } from './authed-fetch';

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

export function listNotifications(params: { limit?: number; cursor?: string } = {}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.cursor) q.set('cursor', params.cursor);
  const qs = q.toString();
  return authedFetch<NotificationList>(`/notifications${qs ? `?${qs}` : ''}`);
}

export function unreadNotificationCount() {
  return authedFetch<{ count: number }>(`/notifications/unread-count`);
}

export function markAllNotificationsRead() {
  return authedFetch<{ ok: true; updated: number }>(`/notifications/read-all`, {
    method: 'POST',
  });
}

export function markNotificationRead(id: string) {
  return authedFetch<{ ok: boolean }>(`/notifications/${id}/read`, {
    method: 'POST',
  });
}
