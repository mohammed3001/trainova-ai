import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CompaniesModule } from '../companies/companies.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

/**
 * Marked `@Global()` so feature services (applications, contracts,
 * interviews, payments) can inject `WebhooksService.dispatch()` from
 * any module without the consuming module needing to re-import. The
 * alternative — making each consumer import `WebhooksModule` —
 * creates fan-out import noise + circular-import risk in modules
 * that webhooks itself depends on (e.g. NotificationsModule).
 */
@Global()
@Module({
  imports: [PrismaModule, CompaniesModule, ScheduleModule.forRoot()],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
