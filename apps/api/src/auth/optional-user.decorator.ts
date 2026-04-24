import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { verify, type JwtPayload as JsonJwtPayload } from 'jsonwebtoken';
import type { Request } from 'express';
import type { JwtPayload } from './jwt.strategy';

/**
 * Returns the caller's user id if a valid bearer access token is
 * present, or `null` for anonymous traffic. Used on public endpoints
 * (ads serving, public trainer lookup, etc.) where we want to attribute
 * activity to logged-in users without gating the route behind auth.
 *
 * Invalid / expired / wrong-kind tokens all return `null` silently —
 * never throw. Anonymous callers must still be able to hit the route.
 */
export const CurrentUserOptional = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
    const token = header.slice(7).trim();
    if (!token) return null;
    try {
      const secret = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
      const payload = verify(token, secret) as JwtPayload & JsonJwtPayload;
      return typeof payload.sub === 'string' ? payload.sub : null;
    } catch {
      return null;
    }
  },
);
