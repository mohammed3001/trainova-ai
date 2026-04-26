import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  RETARGETING_COOKIE_MAX_AGE_SECONDS,
  RETARGETING_COOKIE_NAME,
  retargetingEntityKindSchema,
  retargetingEventInputSchema,
  retargetingEventTypeSchema,
  type RetargetingEventInput,
} from '@trainova/shared';
import { CurrentUserOptional } from '../auth/optional-user.decorator';
import { clientIp } from '../common/client-ip.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RetargetingService } from './retargeting.service';

/**
 * Public ingestion endpoints for the retargeting pixel + JSON event API.
 * Both endpoints are unauthenticated (anonymous traffic is the whole
 * point of behavioural retargeting); when the visitor is logged in we
 * still attribute the event to the user via `CurrentUserOptional`.
 */
@ApiTags('retargeting')
@Controller('retargeting')
export class RetargetingPixelController {
  constructor(private readonly service: RetargetingService) {}

  /**
   * 1×1 transparent GIF, served with `image/gif` so it can be embedded
   * via `<img src="...">` from any page (including third-party-rendered
   * email clients that strip JS). Sets `_tr_visit` if missing, then
   * records a single event whose fields come from the query string.
   *
   * Excluded from Swagger because it isn't a JSON endpoint.
   */
  @Get('pixel.gif')
  @ApiExcludeEndpoint()
  // Bypass the global IP throttle (120/min) on the GIF endpoint only:
  // a single page can embed multiple pixels and shared-IP visitors
  // (corporate networks, VPNs) would otherwise see broken-image icons
  // long before they exceed any reasonable browsing rate. The JSON
  // event endpoint below keeps its throttle to prevent flood DoS.
  @SkipThrottle()
  async pixel(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUserOptional() userId: string | null,
    @Query('evt') evt: string | undefined,
    @Query('kind') kind: string | undefined,
    @Query('id') id: string | undefined,
    @Query('path') path: string | undefined,
    @Query('locale') locale: string | undefined,
  ): Promise<void> {
    // The pixel must always return the GIF — even on cookie/validation
    // failure — so that an `<img>` tag never produces a broken-image
    // icon for the visitor. Errors are swallowed and the GIF is sent
    // unconditionally at the bottom of the handler.
    let cookieId: string;
    try {
      cookieId = ensureCookie(req, res);
    } catch {
      // `randomBytes` or `res.setHeader` failed — fall back to an
      // ephemeral id so we can still attempt event recording (and so
      // the GIF response below is reached).
      cookieId = RetargetingService.newCookieId();
    }
    try {
      const parsed = parsePixelQuery({ evt, kind, id, path, locale });
      if (parsed) {
        await this.service.recordEvent({
          cookieId,
          userId,
          input: parsed,
          userAgent: typeof req.headers['user-agent'] === 'string'
            ? req.headers['user-agent']
            : null,
          ipHash: RetargetingService.hashIp(clientIp(req)),
        });
      }
    } catch {
      // Never let event-recording failures bubble up to the client —
      // a broken pixel must not break page rendering.
    }
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).end(GIF_PIXEL);
  }

  /**
   * JSON event endpoint for client-side JS that wants richer payloads
   * than fit comfortably in the pixel query string. Same auth + cookie
   * model as the pixel.
   */
  @Post('event')
  @HttpCode(204)
  async event(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUserOptional() userId: string | null,
    @Body(new ZodValidationPipe(retargetingEventInputSchema))
    body: RetargetingEventInput,
  ): Promise<void> {
    const cookieId = ensureCookie(req, res);
    await this.service.recordEvent({
      cookieId,
      userId,
      input: body,
      userAgent: typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent']
        : null,
      ipHash: RetargetingService.hashIp(clientIp(req)),
    });
  }
}

/**
 * Read the existing tracking cookie, or mint a fresh one and `Set-Cookie`
 * it on the outgoing response. Cookie is `HttpOnly` so client-side JS
 * can't read it (we don't need that), `SameSite=Lax` so it travels on
 * top-level navigations between web and api hostnames, and `Secure` only
 * in production (dev runs on plain http).
 */
function ensureCookie(req: Request, res: Response): string {
  const existing = readCookie(req, RETARGETING_COOKIE_NAME);
  if (existing) return existing;
  const fresh = RetargetingService.newCookieId();
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${RETARGETING_COOKIE_NAME}=${fresh}`,
    'Path=/',
    `Max-Age=${RETARGETING_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (isProd) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  return fresh;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  // The Express `cookie-parser` middleware isn't installed app-wide; we
  // parse just this one cookie inline so we don't take a transitive
  // dependency for a single read.
  const parts = header.split(';');
  for (const raw of parts) {
    const [k, ...v] = raw.trim().split('=');
    if (k === name) {
      // `decodeURIComponent` throws `URIError` on malformed percent-
      // encoding (e.g. `_tr_visit=rt_%ZZ`). The pixel handler relies on
      // this function being infallible so the GIF response is always
      // produced — treat a malformed cookie value as "no cookie" and
      // let the caller mint a fresh one.
      try {
        return decodeURIComponent(v.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parsePixelQuery(q: {
  evt: string | undefined;
  kind: string | undefined;
  id: string | undefined;
  path: string | undefined;
  locale: string | undefined;
}): RetargetingEventInput | null {
  if (!q.evt) return null;
  const evt = retargetingEventTypeSchema.safeParse(q.evt);
  if (!evt.success) return null;
  const kind = q.kind
    ? retargetingEntityKindSchema.safeParse(q.kind).data
    : undefined;
  // Re-run the full Zod validator so `path`/`id`/`locale` pick up the
  // same length + shape constraints as the JSON endpoint.
  const result = retargetingEventInputSchema.safeParse({
    eventType: evt.data,
    entityKind: kind,
    entityId: q.id,
    path: q.path,
    locale: q.locale,
  });
  if (!result.success) {
    // We deliberately do not surface validation errors via the GIF —
    // see `pixel()` above. Returning null skips event recording without
    // creating an exception object on every malformed query string and
    // keeps the function safe to call from non-pixel contexts.
    return null;
  }
  return result.data;
}

/**
 * Smallest valid 1×1 transparent GIF, copied from the GIF89a spec.
 * 43 bytes; no external asset dependency.
 */
const GIF_PIXEL = Buffer.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
  0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
]);
