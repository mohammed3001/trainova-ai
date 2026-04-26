import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiTokenScope } from '@trainova/shared';
import { clientIp } from '../common/client-ip.util';
import { ApiTokensService } from './api-tokens.service';

export const API_TOKEN_SCOPE_KEY = 'api-token-scope';

/**
 * Decorator that declares the scope a `/v1/*` endpoint requires. The
 * guard reads this on every request and rejects tokens that don't
 * carry the listed scope.
 */
export const RequireApiTokenScope = (scope: ApiTokenScope) =>
  SetMetadata(API_TOKEN_SCOPE_KEY, scope);

/**
 * Per-token sliding-window rate limiter (process-local). Public-API
 * traffic is low and concentrated on `/v1/*`; if we ever need a
 * shared counter we can swap this for a Redis bucket without changing
 * the guard's contract.
 */
class TokenRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly windowMs = 60_000;

  consume(tokenId: string, limitPerMinute: number): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    const list = this.buckets.get(tokenId) ?? [];
    while (list.length > 0 && list[0]! < cutoff) list.shift();
    if (list.length >= limitPerMinute) {
      this.buckets.set(tokenId, list);
      return false;
    }
    list.push(now);
    this.buckets.set(tokenId, list);
    return true;
  }
}

const limiter = new TokenRateLimiter();

export interface ApiTokenContext {
  tokenId: string;
  companyId: string;
  scopes: ApiTokenScope[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // Augment Express's Request so handlers can read the resolved
    // token context off `req.apiToken` after the guard runs.
    interface Request {
      apiToken?: ApiTokenContext;
    }
  }
}

/**
 * Guard for the `/v1/*` Public API. Reads the bearer token from the
 * `Authorization` header, resolves it via {@link ApiTokensService},
 * enforces the per-method scope declared via `@RequireApiTokenScope`,
 * applies the per-token rate limit, then attaches the resolved
 * context to `req.apiToken` for handlers to read.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  private readonly logger = new Logger(ApiTokenGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: ApiTokensService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const required = this.reflector.getAllAndOverride<ApiTokenScope | undefined>(
      API_TOKEN_SCOPE_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) {
      // A `/v1/*` controller method without a declared scope is a
      // bug — fail closed so we don't silently expose new endpoints.
      throw new ForbiddenException('API endpoint is missing a scope declaration');
    }

    const raw = this.extractBearer(req);
    if (!raw) throw new UnauthorizedException('Missing API token');

    const resolved = await this.tokens.resolveToken(raw);
    if (!resolved) throw new UnauthorizedException('Invalid or revoked API token');

    if (!resolved.scopes.includes(required)) {
      throw new ForbiddenException(`Token is missing required scope '${required}'`);
    }

    if (!limiter.consume(resolved.id, resolved.rateLimitPerMinute)) {
      // 429 surfaces via Nest's HttpException mapping when callers
      // upgrade to a typed response; for now log and reject.
      this.logger.warn(`Rate limit exceeded for token ${resolved.id}`);
      throw new ForbiddenException('Rate limit exceeded; try again in 60 seconds');
    }

    req.apiToken = {
      tokenId: resolved.id,
      companyId: resolved.companyId,
      scopes: resolved.scopes,
    };

    // Fire-and-forget housekeeping; failures don't block the request.
    void this.tokens.recordUsage(resolved.id, clientIp(req));

    return true;
  }

  private extractBearer(req: Request): string | null {
    const header = req.headers.authorization ?? req.headers.Authorization;
    if (typeof header !== 'string') return null;
    const trimmed = header.trim();
    if (!trimmed.toLowerCase().startsWith('bearer ')) return null;
    const value = trimmed.slice(7).trim();
    return value.length > 0 ? value : null;
  }
}
