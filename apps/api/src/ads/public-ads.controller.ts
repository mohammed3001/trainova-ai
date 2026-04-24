import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  AD_PLACEMENTS,
  impressionInputSchema,
  serveAdsInputSchema,
  type AdPlacement,
  type ImpressionInput,
  type PublicAdCreative,
  type ServeAdsInput,
} from '@trainova/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentUserOptional } from '../auth/optional-user.decorator';
import { AdsService } from './ads.service';

/**
 * Public endpoints — no auth required. Ads are served to anonymous
 * visitors as well as logged-in users; we derive a `sessionHash` from
 * `(ip, user-agent)` for frequency capping without tracking cookies.
 */
@ApiTags('ads')
@Controller('ads')
export class PublicAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get('serve')
  async serve(
    @Req() req: Request,
    @CurrentUserOptional() userId: string | null,
    @Query('placement') placementQ: string | undefined,
    @Query('locale') locale: string | undefined,
    @Query('country') country: string | undefined,
    @Query('limit') limitQ: string | undefined,
    @Query('skills') skillsQ: string | undefined,
  ): Promise<{ creatives: PublicAdCreative[] }> {
    if (!placementQ || !(AD_PLACEMENTS as readonly string[]).includes(placementQ)) {
      throw new BadRequestException('Unknown ad placement');
    }
    const parsed: ServeAdsInput = serveAdsInputSchema.parse({
      placement: placementQ as AdPlacement,
      locale,
      country,
      skillIds: skillsQ ? skillsQ.split(',').filter(Boolean).slice(0, 8) : undefined,
      limit: limitQ ? Number.parseInt(limitQ, 10) : undefined,
    });
    const creatives = await this.ads.serveAds(parsed, {
      sessionHash: AdsService.hashSession(
        extractClientIp(req),
        String(req.headers['user-agent'] ?? ''),
      ),
      userId,
    });
    return { creatives };
  }

  @Post('impression')
  @UsePipes(new ZodValidationPipe(impressionInputSchema))
  async recordImpression(
    @Req() req: Request,
    @CurrentUserOptional() userId: string | null,
    @Body() body: ImpressionInput,
  ) {
    return this.ads.recordImpression(body, {
      sessionHash: AdsService.hashSession(
        extractClientIp(req),
        String(req.headers['user-agent'] ?? ''),
      ),
      userId,
      locale: String(req.query?.locale ?? '') || undefined,
      country: String(req.query?.country ?? '') || undefined,
    });
  }

  /**
   * 302 redirect to the creative's landing URL, logging the click and
   * debiting the campaign budget. Crawlers get `noindex,nofollow` to
   * keep the ad destination from leaking into SEO.
   */
  @Get('click/:id')
  @ApiExcludeEndpoint()
  async click(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUserOptional() userId: string | null,
    @Param('id') id: string,
    @Query('p') placementQ: string | undefined,
  ): Promise<void> {
    const placement =
      placementQ && (AD_PLACEMENTS as readonly string[]).includes(placementQ)
        ? (placementQ as AdPlacement)
        : undefined;
    const { ctaUrl } = await this.ads.recordClickAndResolve(
      id,
      {
        sessionHash: AdsService.hashSession(
          extractClientIp(req),
          String(req.headers['user-agent'] ?? ''),
        ),
        userId,
        locale: String(req.query?.locale ?? '') || undefined,
        country: String(req.query?.country ?? '') || undefined,
      },
      placement,
    );
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, ctaUrl);
  }
}

function extractClientIp(req: Request): string {
  // The Nest app already runs `app.set('trust proxy', true)` in
  // `main.ts` (see the XFF anti-spoof work in PR #12). `req.ip`
  // therefore respects only trusted proxies; we still fall back to the
  // socket address so dev traffic without a proxy hash-scopes cleanly.
  return (req.ip || req.socket.remoteAddress || '').toString();
}
