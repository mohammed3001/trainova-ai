import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCmsController } from './cms.controller';
import { CmsService } from './cms.service';
import { PublicCmsController } from './public-cms.controller';

@Module({
  imports: [AuthModule],
  controllers: [AdminCmsController, PublicCmsController],
  providers: [CmsService],
  exports: [CmsService],
})
export class CmsModule {}
