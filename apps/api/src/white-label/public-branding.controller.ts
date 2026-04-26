import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WhiteLabelService } from './white-label.service';

@ApiTags('public-branding')
@Controller('public/branding')
export class PublicBrandingController {
  constructor(private readonly whiteLabel: WhiteLabelService) {}

  // The web app calls this from a server component on the white-label entry
  // route to bootstrap theme variables before the first paint. We accept either
  // an explicit ?host= query param (when proxied behind a CDN that cannot be
  // trusted to forward Host) or the inbound Host header. Returning null is the
  // safe default — the app falls back to the platform theme.
  @Get()
  async resolve(@Headers('host') host: string | undefined, @Query('host') hostQuery?: string) {
    return this.whiteLabel.resolvePublicByHost(hostQuery ?? host ?? null);
  }
}
