import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhiteLabelService } from './white-label.service';
import { WhiteLabelController } from './white-label.controller';
import { PublicBrandingController } from './public-branding.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WhiteLabelController, PublicBrandingController],
  providers: [WhiteLabelService],
  exports: [WhiteLabelService],
})
export class WhiteLabelModule {}
