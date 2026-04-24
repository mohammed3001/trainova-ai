'use client';

import { io, type Socket } from 'socket.io-client';
import type { NotificationItem } from './notifications-api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

let singleton: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

async function fetchTicket(): Promise<string> {
  const res = await fetch('/api/proxy/auth/ws-ticket', {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error(`ws-ticket failed (${res.status})`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

export async function getNotificationsSocket(): Promise<Socket> {
  // Existence guard (not `connected`) so Strict-Mode double effects don't
  // create duplicate sockets during the in-flight handshake.
  if (singleton && !singleton.disconnected) return singleton;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    const token = await fetchTicket();
    const s = io(API_URL, {
      path: '/ws/notifications',
      transports: ['websocket', 'polling'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
    });
    s.on('connect_error', async (err) => {
      if (String(err.message).toLowerCase().includes('auth')) {
        try {
          const fresh = await fetchTicket();
          s.auth = { token: fresh };
          s.connect();
        } catch {
          /* fall back to REST polling in UI */
        }
      }
    });
    singleton = s;
    connectPromise = null;
    return s;
  })();
  return connectPromise;
}

export function disconnectNotificationsSocket() {
  singleton?.disconnect();
  singleton = null;
  connectPromise = null;
}

export type NotificationNewEvent = NotificationItem;
