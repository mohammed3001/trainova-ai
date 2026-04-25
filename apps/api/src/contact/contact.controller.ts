import { Body, Controller, HttpCode, Post, Req, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  advertiseEnquirySchema,
  contactSubmissionSchema,
  type AdvertiseEnquiryParsed,
  type ContactSubmissionParsed,
} from '@trainova/shared';
import type { Request } from 'express';
import { clientIp } from '../common/client-ip.util';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ContactService } from './contact.service';

@ApiTags('contact')
@Controller('public/contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(contactSubmissionSchema))
  async submit(@Body() body: ContactSubmissionParsed, @Req() req: Request) {
    // Honeypot — silently drop, return success so bots can't probe.
    if ((body as ContactSubmissionParsed & { website?: string }).website) {
      return { ok: true as const, id: 'dropped' };
    }
    const row = await this.contact.submit(body, {
      ip: clientIp(req) ?? undefined,
      userAgent: req.get('user-agent') ?? undefined,
    });
    return { ok: true as const, id: row.id };
  }

  @Post('advertise')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(advertiseEnquirySchema))
  async submitAdvertise(
    @Body() body: AdvertiseEnquiryParsed,
    @Req() req: Request,
  ) {
    if ((body as AdvertiseEnquiryParsed & { website?: string }).website) {
      return { ok: true as const, id: 'dropped' };
    }
    const row = await this.contact.submitAdvertiseEnquiry(body, {
      ip: clientIp(req) ?? undefined,
      userAgent: req.get('user-agent') ?? undefined,
    });
    return { ok: true as const, id: row.id };
  }
}
