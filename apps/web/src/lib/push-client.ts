'use client';

import { proxyJson } from './notifications-api';

/**
 * Browser-side Web Push registration. Talks to the service worker
 * registered at `/sw.js` and to the API's `/notifications/push/*`
 * endpoints (proxied through `/api/proxy`).
 *
 * Designed to be **idempotent**: calling enable() twice never produces
 * a second subscription, calling disable() while not subscribed is a
 * no-op, etc. The bell hook is the only caller and treats every method
 * as fire-and-forget.
 */

export interface PushBootstrap {
  enabled: boolean;
  publicKey: string | null;
}

const SW_PATH = '/sw.js';

export async function fetchPushBootstrap(): Promise<PushBootstrap> {
  try {
    return await proxyJson<PushBootstrap>(`/notifications/push/public-key`);
  } catch {
    return { enabled: false, publicKey: null };
  }
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  // ready resolves only after the SW activates, so the `pushManager`
  // call below is safe even if the user lands on the bell before the
  // first install completes.
  const existing = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_PATH, { scope: '/' });
}

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/**
 * Idempotently enable push. Returns the resulting permission so the
 * caller can render an explanation if the user denies.
 */
export async function enablePush(
  publicKey: string,
): Promise<{ ok: boolean; permission: NotificationPermission }> {
  if (!isPushSupported()) return { ok: false, permission: 'denied' };
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, permission };
  const reg = await registerServiceWorker();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    });
  }
  const json = sub.toJSON() as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, permission };
  }
  await proxyJson(`/notifications/push/subscribe`, {
    method: 'POST',
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  return { ok: true, permission };
}

/** Idempotently revoke the local subscription + tell the server. */
export async function disablePush(): Promise<{ ok: boolean }> {
  if (!isPushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  await proxyJson(`/notifications/push/subscribe`, {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  }).catch(() => undefined);
  return { ok: true };
}

/** True iff the browser already has a live PushSubscription for this origin. */
export async function isSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
