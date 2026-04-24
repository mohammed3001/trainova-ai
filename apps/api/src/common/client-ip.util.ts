import type { Request } from 'express';

/**
 * Resolve the requesting client's IP address. Express has been configured with
 * `app.set('trust proxy', 'loopback')` (see apps/api/src/main.ts) so `req.ip`
 * already honours `X-Forwarded-For` / `X-Real-IP` only when the immediate TCP
 * peer is the loopback Next.js proxy and falls back to the socket address
 * otherwise. This helper centralises that lookup so audit logs across the
 * codebase capture the real client IP rather than an upstream proxy hop.
 */
export function clientIp(req: Request): string | null {
  if (typeof req.ip === 'string' && req.ip.length > 0) return req.ip;
  return (req.socket as { remoteAddress?: string })?.remoteAddress ?? null;
}
