import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { FlagContext } from '@trainova/shared';
import { CurrentUserOptional } from '../auth/optional-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from './feature-flags.service';

function headerLocale(req: Request): string | null {
  const xLoc = req.headers['x-user-locale'];
  if (typeof xLoc === 'string' && xLoc) return xLoc.slice(0, 5);
  const accept = req.headers['accept-language'];
  if (typeof accept === 'string' && accept) return accept.split(',')[0]?.slice(0, 5) ?? null;
  return null;
}

function headerCountry(req: Request): string | null {
  const x = req.headers['x-user-country'];
  if (typeof x === 'string' && x) return x.toUpperCase().slice(0, 2);
  const cf = req.headers['cf-ipcountry'];
  if (typeof cf === 'string' && cf) return cf.toUpperCase().slice(0, 2);
  return null;
}

/**
 * Public, optionally-authenticated evaluator. Admin CRUD for feature flags is
 * exposed by `CmsController` (T5.C.1) — this module owns the *evaluation*
 * logic only (rollout buckets, audience targeting, variant selection).
 */
@ApiTags('public')
@Controller('public/feature-flags')
export class PublicFeatureFlagsController {
  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly prisma: PrismaService,
  ) {}

  private async buildContext(userId: string | null, req: Request): Promise<FlagContext> {
    const country = headerCountry(req);
    const locale = headerLocale(req);
    if (!userId) {
      return { userId: null, email: null, role: null, country, locale };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });
    if (!user) return { userId: null, email: null, role: null, country, locale };
    return {
      userId: user.id,
      email: user.email,
      role: user.role as FlagContext['role'],
      country,
      locale,
    };
  }

  @Get('evaluate')
  async evaluate(
    @CurrentUserOptional() userId: string | null,
    @Req() req: Request,
    @Query('key') key: string,
  ) {
    const ctx = await this.buildContext(userId, req);
    return this.flags.evaluate(key, ctx);
  }

  @Post('evaluate')
  async evaluateMany(
    @CurrentUserOptional() userId: string | null,
    @Req() req: Request,
    @Body() body: { keys?: string[] },
  ) {
    const keys = Array.isArray(body?.keys) ? body.keys.filter((k) => typeof k === 'string') : [];
    const ctx = await this.buildContext(userId, req);
    return this.flags.evaluateMany(keys, ctx);
  }
}
