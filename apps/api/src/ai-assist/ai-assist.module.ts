import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { AiAssistService } from './ai-assist.service';
import { AiAssistController } from './ai-assist.controller';

@Module({
  imports: [PrismaModule, FeatureFlagsModule],
  controllers: [AiAssistController],
  providers: [AiAssistService],
  exports: [AiAssistService],
})
export class AiAssistModule {}
