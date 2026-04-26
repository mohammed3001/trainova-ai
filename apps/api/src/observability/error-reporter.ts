import { Logger } from '@nestjs/common';

/**
 * Polish pass — error reporter abstraction.
 *
 * Every unhandled exception flowing through `AllExceptionsFilter` is
 * forwarded to a `ErrorReporter`. The default `NoopErrorReporter` only
 * logs. When `SENTRY_DSN` is set, `SentryErrorReporter` posts envelopes
 * to Sentry's `store` endpoint over `fetch` — keeping the runtime
 * dependency footprint at zero and avoiding the heavyweight
 * `@sentry/node` SDK + its OpenTelemetry transitive dependencies. The
 * payload format is the documented public Sentry event schema, so any
 * Sentry-compatible ingest (GlitchTip, Sentry SaaS, self-hosted Sentry)
 * works without changes.
 *
 * The seam is pluggable: a future Datadog / Honeycomb integration is
 * one new class implementing `ErrorReporter`.
 */
export interface ErrorReportContext {
  /** Express request URL (without query). */
  url?: string;
  /** HTTP method, lowercased. */
  method?: string;
  /** Resolved user id from the JWT, when available. */
  userId?: string;
  /** Originating IP after `trust proxy` resolution. */
  ip?: string;
  /** Free-form tags surfaced as Sentry tags (string-only values). */
  tags?: Record<string, string>;
  /** Extra structured context attached as Sentry `extra`. */
  extra?: Record<string, unknown>;
}

export interface ErrorReporter {
  captureException(error: unknown, ctx?: ErrorReportContext): void;
  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    ctx?: ErrorReportContext,
  ): void;
}

export const ERROR_REPORTER = Symbol('ERROR_REPORTER');

export class NoopErrorReporter implements ErrorReporter {
  private readonly logger = new Logger('ErrorReporter');

  captureException(error: unknown, ctx?: ErrorReportContext): void {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    this.logger.error(
      `unhandled: ${message}${ctx?.url ? ` [${ctx.method ?? 'GET'} ${ctx.url}]` : ''}`,
      stack,
    );
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    ctx?: ErrorReportContext,
  ): void {
    const line = `${level.toUpperCase()} ${message}${ctx?.url ? ` [${ctx.method ?? 'GET'} ${ctx.url}]` : ''}`;
    if (level === 'error') this.logger.error(line);
    else if (level === 'warning') this.logger.warn(line);
    else this.logger.log(line);
  }
}

interface SentryDsn {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: 'http' | 'https';
}

function parseDsn(dsn: string): SentryDsn | null {
  // Accepts the documented Sentry DSN form:
  //   https://<publicKey>@o<orgId>.ingest.sentry.io/<projectId>
  // (also works for self-hosted: https://<publicKey>@<host>/<projectId>)
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return {
      publicKey: url.username,
      host: url.host,
      projectId,
      protocol: url.protocol === 'http:' ? 'http' : 'https',
    };
  } catch {
    return null;
  }
}

export class SentryErrorReporter implements ErrorReporter {
  private readonly logger = new Logger('SentryErrorReporter');
  private readonly endpoint: string;
  private readonly auth: string;
  private readonly environment: string;
  private readonly release?: string;

  constructor(
    private readonly dsn: SentryDsn,
    opts: { environment: string; release?: string },
  ) {
    this.endpoint = `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/store/`;
    this.auth = [
      'Sentry sentry_version=7',
      `sentry_client=trainova-ai/0.1.0`,
      `sentry_key=${dsn.publicKey}`,
    ].join(', ');
    this.environment = opts.environment;
    this.release = opts.release;
  }

  captureException(error: unknown, ctx?: ErrorReportContext): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const event = this.buildEvent('error', err.message, ctx, err);
    void this.send(event);
  }

  captureMessage(
    message: string,
    level: 'info' | 'warning' | 'error',
    ctx?: ErrorReportContext,
  ): void {
    const event = this.buildEvent(level, message, ctx);
    void this.send(event);
  }

  private buildEvent(
    level: 'info' | 'warning' | 'error',
    message: string,
    ctx?: ErrorReportContext,
    err?: Error,
  ): Record<string, unknown> {
    const event: Record<string, unknown> = {
      event_id: cryptoRandomEventId(),
      timestamp: Date.now() / 1000,
      level,
      platform: 'node',
      logger: 'trainova-api',
      environment: this.environment,
      release: this.release,
      message: { formatted: message },
      tags: { ...(ctx?.tags ?? {}) },
    };
    if (ctx?.userId) (event as Record<string, unknown>).user = { id: ctx.userId, ip_address: ctx.ip };
    if (ctx?.url) {
      (event as Record<string, unknown>).request = {
        url: ctx.url,
        method: ctx.method,
      };
    }
    if (ctx?.extra) (event as Record<string, unknown>).extra = ctx.extra;
    if (err) {
      (event as Record<string, unknown>).exception = {
        values: [
          {
            type: err.name || 'Error',
            value: err.message,
            stacktrace: parseStack(err.stack),
          },
        ],
      };
    }
    return event;
  }

  private async send(event: Record<string, unknown>): Promise<void> {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-sentry-auth': this.auth,
        },
        body: JSON.stringify(event),
        // Best-effort: short timeout so a slow Sentry never blocks the app.
        signal: AbortSignal.timeout(2_000),
      });
      if (!res.ok && res.status !== 429) {
        this.logger.warn(`sentry rejected event: ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`sentry send failed: ${(err as Error).message}`);
    }
  }
}

function parseStack(stack: string | undefined): { frames: Array<Record<string, unknown>> } | undefined {
  if (!stack) return undefined;
  const frames: Array<Record<string, unknown>> = [];
  const lines = stack.split('\n').slice(1); // drop the "Error: msg" header
  for (const raw of lines) {
    const m = /\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/.exec(raw.trim());
    if (!m) continue;
    const filename = m[2] ?? '<unknown>';
    frames.push({
      function: m[1] ?? '<anonymous>',
      filename,
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !filename.includes('node_modules'),
    });
  }
  if (frames.length === 0) return undefined;
  // Sentry expects bottom-most frame first.
  frames.reverse();
  return { frames };
}

function cryptoRandomEventId(): string {
  // Sentry expects 32 hex chars, no dashes. Built without pulling
  // `crypto` so this works in workerd / edge runtimes too.
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

/**
 * Build the right reporter for the current process. Falls back to the
 * noop reporter (which only logs) when `SENTRY_DSN` is unset, malformed,
 * or when running in `test`/`ci` so unit/E2E suites don't make network
 * calls.
 */
export function buildErrorReporter(env: NodeJS.ProcessEnv = process.env): ErrorReporter {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn || env.NODE_ENV === 'test') {
    return new NoopErrorReporter();
  }
  const parsed = parseDsn(dsn);
  if (!parsed) {
    new Logger('ErrorReporter').warn(`invalid SENTRY_DSN, falling back to noop reporter`);
    return new NoopErrorReporter();
  }
  return new SentryErrorReporter(parsed, {
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    release: env.SENTRY_RELEASE,
  });
}
