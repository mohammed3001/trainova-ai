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
import { PublicModule } from './public/public.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
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
    AdminModule,
    PublicModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
