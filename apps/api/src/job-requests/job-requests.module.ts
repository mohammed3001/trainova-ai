import { Module } from '@nestjs/common';
import { JobRequestsController } from './job-requests.controller';
import { JobRequestsService } from './job-requests.service';

@Module({
  controllers: [JobRequestsController],
  providers: [JobRequestsService],
  exports: [JobRequestsService],
})
export class JobRequestsModule {}
