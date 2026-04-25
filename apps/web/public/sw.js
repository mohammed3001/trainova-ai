/* Trainova AI service worker — Web Push receiver. Kept minimal: no
   caching, no background sync. Scoped to the origin so it can show
   notifications for any route on the site. */

self.addEventListener('install', (event) => {
  // Take over immediately on first install so the very next push from
  // the server is handled by this version.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Trainova AI', body: event.data.text(), href: '/' };
  }
  const title = data.title || 'Trainova AI';
  const body = data.body || '';
  const href = typeof data.href === 'string' ? data.href : '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: { href, type: data.type, meta: data.meta || {} },
      // Tag so successive emails about the same conversation stack
      // rather than spamming the user; falls back to the raw href.
      tag:
        (data.meta && (data.meta.conversationId || data.meta.applicationId)) ||
        href,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href =
    (event.notification.data && event.notification.data.href) || '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((all) => {
        // If the app is already open in a tab, focus it and navigate
        // there rather than spawning a new tab.
        for (const c of all) {
          if ('focus' in c) {
            c.focus();
            if ('navigate' in c) {
              try {
                c.navigate(href);
              } catch {
                /* cross-origin or detached — ignore */
              }
            }
            return;
          }
        }
        return self.clients.openWindow(href);
      }),
  );
});
