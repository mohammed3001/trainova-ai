/**
 * Polish pass — browser-side error reporter.
 *
 * Mirrors `apps/api/src/observability/error-reporter.ts`: when
 * `NEXT_PUBLIC_SENTRY_DSN` is set, we POST a Sentry-shaped event to
 * the DSN's `store` endpoint over `fetch`. When it isn't, the reporter
 * is a no-op (server logs the error in `error.tsx` instead). Keeping
 * the DSN parsing + envelope shape inline lets us avoid pulling
 * `@sentry/nextjs` (~200KB on the client) for what amounts to a
 * single fire-and-forget POST.
 */

interface SentryDsn {
  publicKey: string;
  origin: string;
  projectId: string;
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      origin: `${url.protocol}//${url.host}`,
      projectId,
    };
  } catch {
    return null;
  }
}

function randomEventId(): string {
  let out = '';
  for (let i = 0; i < 32; i++) out += Math.floor(Math.random() * 16).toString(16);
  return out;
}

function parseStack(stack: string | undefined): { frames: Array<Record<string, unknown>> } | undefined {
  if (!stack) return undefined;
  const frames: Array<Record<string, unknown>> = [];
  for (const raw of stack.split('\n').slice(1)) {
    const m = /\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(raw.trim());
    if (!m) continue;
    const filename = m[2] ?? '<unknown>';
    frames.push({
      function: m[1] ?? '<anonymous>',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('/_next/') && !filename.includes('node_modules'),
    });
  }
  if (frames.length === 0) return undefined;
  frames.reverse();
  return { frames };
}

let cachedDsn: SentryDsn | null | undefined;

function getDsn(): SentryDsn | null {
  if (cachedDsn !== undefined) return cachedDsn;
  const raw = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();
  cachedDsn = raw ? parseDsn(raw) : null;
  return cachedDsn;
}

export interface BrowserReportContext {
  digest?: string;
  route?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export function reportClientError(
  error: unknown,
  ctx: BrowserReportContext = {},
): void {
  const dsn = getDsn();
  if (!dsn) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const event: Record<string, unknown> = {
    event_id: randomEventId(),
    timestamp: Date.now() / 1000,
    level: 'error',
    platform: 'javascript',
    logger: 'trainova-web',
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'production',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    message: { formatted: err.message },
    tags: { ...(ctx.tags ?? {}), ...(ctx.digest ? { digest: ctx.digest } : {}) },
    extra: ctx.extra,
    request:
      typeof window !== 'undefined'
        ? { url: ctx.route ?? window.location.href, headers: { 'User-Agent': navigator.userAgent } }
        : undefined,
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: err.message,
          stacktrace: parseStack(err.stack),
        },
      ],
    },
  };
  const url = `${dsn.origin}/api/${dsn.projectId}/store/`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-sentry-auth': [
      'Sentry sentry_version=7',
      'sentry_client=trainova-web/0.1.0',
      `sentry_key=${dsn.publicKey}`,
    ].join(', '),
  };
  // Best-effort. We never want a Sentry outage to surface to the user;
  // swallow every failure (network, CORS, abort).
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      // sendBeacon doesn't honor x-sentry-auth — fall back to fetch.
      void fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
        keepalive: true,
      }).catch(() => undefined);
    } else {
      void fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(event),
      }).catch(() => undefined);
    }
  } catch {
    /* swallow */
  }
}
