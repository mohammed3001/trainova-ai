import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponsAdminController } from './coupons-admin.controller';
import { CouponsController } from './coupons.controller';
import { CouponsService } from './coupons.service';

@Module({
  imports: [PrismaModule],
  controllers: [CouponsAdminController, CouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
