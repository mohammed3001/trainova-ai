import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkbenchController } from './workbench.controller';
import { WorkbenchService } from './workbench.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkbenchController],
  providers: [WorkbenchService],
  exports: [WorkbenchService],
})
export class WorkbenchModule {}
