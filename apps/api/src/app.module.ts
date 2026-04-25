import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { TrainersModule } from './trainers/trainers.module';
import { SkillsModule } from './skills/skills.module';
import { JobRequestsModule } from './job-requests/job-requests.module';
import { ApplicationsModule } from './applications/applications.module';
import { TestsModule } from './tests/tests.module';
import { ChatModule } from './chat/chat.module';
import { AdminModule } from './admin/admin.module';
import { CmsModule } from './cms/cms.module';
import { VerificationModule } from './verification/verification.module';
import { PublicModule } from './public/public.module';
import { UploadsModule } from './uploads/uploads.module';
import { ModelsModule } from './models/models.module';
import { WorkbenchModule } from './workbench/workbench.module';
import { PaymentsModule } from './payments/payments.module';
import { AdsModule } from './ads/ads.module';
import { SettingsModule } from './settings/settings.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { MatchingModule } from './matching/matching.module';
import { CurrencyModule } from './currency/currency.module';
import { ReviewsModule } from './reviews/reviews.module';
import { DisputesModule } from './disputes/disputes.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { AiAssistModule } from './ai-assist/ai-assist.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // A single 'default' bucket with a generous ceiling for regular traffic.
    // Sensitive auth endpoints override this via @Throttle() at the method level
    // (see apps/api/src/auth/auth.controller.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    CompaniesModule,
    TrainersModule,
    SkillsModule,
    JobRequestsModule,
    ApplicationsModule,
    TestsModule,
    ChatModule,
    VerificationModule,
    AdminModule,
    CmsModule,
    PublicModule,
    UploadsModule,
    ModelsModule,
    WorkbenchModule,
    PaymentsModule,
    AdsModule,
    SettingsModule,
    FeatureFlagsModule,
    MatchingModule,
    CurrencyModule,
    ReviewsModule,
    DisputesModule,
    InvoicingModule,
    AiAssistModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
