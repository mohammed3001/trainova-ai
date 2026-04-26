import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Optional,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ERROR_REPORTER, type ErrorReporter } from './error-reporter';

type AuthedRequest = Request & {
  user?: { id?: string };
};

/**
 * Polish pass — global exception filter that:
 *
 *  1. Translates uncaught errors into a JSON envelope without leaking
 *     internal stack traces in production (NestJS' default
 *     `ExceptionFilter` already does this, but only via the message;
 *     we also normalise the response shape so frontend error parsers
 *     can rely on `{ statusCode, message, error }`).
 *  2. Forwards 5xx exceptions and unknown throwables to the
 *     `ErrorReporter` so we get a Sentry hit (when configured) for
 *     anything that wasn't an expected 4xx like `BadRequestException`.
 *
 * 4xx exceptions are intentionally *not* reported — they're
 * client-input errors, not platform incidents, and would otherwise
 * drown the alert channel in noise.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional()
    @Inject(ERROR_REPORTER)
    private readonly reporter?: ErrorReporter,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    // Global filters fire across every execution context (HTTP,
    // WebSocket, RPC). `switchToHttp()` returns the WS client +
    // payload as `request`/`response` when called from a WS handler,
    // so calling `res.status().json()` would `TypeError` on the
    // payload object and swallow the original error. Guard on the
    // host type and only synthesise an HTTP response for HTTP
    // requests; for WS (and anything else) we still report the error
    // upstream so the Sentry pipeline catches it.
    const hostType = host.getType<'http' | 'ws' | 'rpc'>();
    if (hostType !== 'http') {
      this.reporter?.captureException(exception, {
        tags: { kind: hostType },
      });
      const message = exception instanceof Error ? exception.message : String(exception);
      if (exception instanceof Error) {
        this.logger.error(`unhandled ${hostType}: ${message}`, exception.stack);
      } else {
        this.logger.error(`unhandled ${hostType}: ${message}`);
      }
      // Match NestJS's `BaseWsExceptionFilter`: forward a sanitised
      // payload to the WS client so its `ack(err)` callback fires
      // instead of hanging. Never leak stack traces or raw messages
      // to the client — the original is in the reporter / server log.
      if (hostType === 'ws') {
        const client = host.switchToWs().getClient<{ emit?: (event: string, payload: unknown) => unknown }>();
        client?.emit?.('exception', { status: 'error', message: 'Internal server error' });
      }
      return;
    }
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<AuthedRequest>();

    const { status, body } = this.toResponse(exception);

    if (status >= 500) {
      this.reporter?.captureException(exception, {
        url: req.url,
        method: req.method,
        userId: req.user?.id,
        ip: req.ip,
        tags: { kind: '5xx' },
      });
      this.logger.error(`5xx on ${req.method} ${req.url}: ${body.message}`);
    }
    // Streaming endpoints (PDF invoices, trainer CV exports) flush
    // headers via `stream.pipe(res)` *before* the body finishes
    // writing. If the source stream errors mid-pipe, the response is
    // already in `headersSent=true`, and trying to call
    // `res.status().json()` would throw
    // `Cannot set headers after they are sent to the client` —
    // a secondary failure inside the error handler that swallows
    // the original. Match `BaseExceptionFilter`'s guard and just
    // close the half-written response in that case.
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): {
    status: number;
    body: { statusCode: number; message: string; error?: string };
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      // Nest exceptions pack either a string or
      // `{ statusCode, message, error }` into getResponse(). Coerce both
      // to a stable envelope.
      if (typeof resp === 'string') {
        return { status, body: { statusCode: status, message: resp } };
      }
      const obj = resp as Record<string, unknown>;
      const message = Array.isArray(obj.message)
        ? (obj.message as string[]).join('; ')
        : (obj.message as string | undefined) ?? exception.message;
      return {
        status,
        body: {
          statusCode: status,
          message,
          error: typeof obj.error === 'string' ? obj.error : undefined,
        },
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
      },
    };
  }
}
