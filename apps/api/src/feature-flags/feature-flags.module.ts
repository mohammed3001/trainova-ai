import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FeatureFlagsService } from './feature-flags.service';
import { PublicFeatureFlagsController } from './feature-flags.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PublicFeatureFlagsController],
  providers: [FeatureFlagsService],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
