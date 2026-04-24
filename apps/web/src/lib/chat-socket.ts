'use client';

import { io, type Socket } from 'socket.io-client';

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: string;
  createdAt: string;
  sender?: { id: string; name: string | null; role: string };
}

export interface TypingEvent {
  conversationId: string;
  userId: string;
  typing: boolean;
}

export interface ReadUpdate {
  conversationId: string;
  userId: string;
  lastReadAt: string;
}

export interface PresenceEvent {
  conversationId: string;
  userId: string;
  online: boolean;
}

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

export async function getChatSocket(): Promise<Socket> {
  // Existence check (not `connected`) prevents creating duplicate sockets
  // while the handshake is still in flight — especially under React 18
  // Strict Mode which double-invokes effects. Callers already listen for
  // the `connect` event to learn when the socket is usable.
  if (singleton && !singleton.disconnected) return singleton;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    try {
      const token = await fetchTicket();
      const s = io(API_URL, {
        path: '/ws/chat',
        transports: ['websocket', 'polling'],
        auth: { token },
        reconnection: true,
        reconnectionAttempts: 5,
      });
      // Refresh ticket on auth error or reconnect.
      s.on('connect_error', async (err) => {
        if (String(err.message).toLowerCase().includes('auth')) {
          try {
            const fresh = await fetchTicket();
            s.auth = { token: fresh };
            s.connect();
          } catch {
            /* swallow; UI falls back to REST polling */
          }
        }
      });
      singleton = s;
      return s;
    } finally {
      // Always clear so a transient fetchTicket failure does not permanently
      // cache a rejected promise and block every future getChatSocket call.
      connectPromise = null;
    }
  })();
  return connectPromise;
}

export function disconnectChatSocket() {
  singleton?.disconnect();
  singleton = null;
  connectPromise = null;
}
