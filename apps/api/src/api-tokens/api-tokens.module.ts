import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokenGuard } from './api-token.guard';
import { ApiTokensController } from './api-tokens.controller';
import { PublicApiController } from '../public-api/public-api.controller';

/**
 * T9.B — Public API for Enterprise.
 *
 * Bundles the company-side CRUD controller (`/company/api-tokens`) with
 * the token-guarded public surface (`/v1/*`). Both controllers share a
 * single `ApiTokensService` so token issuance and runtime resolution
 * stay aligned.
 */
@Module({
  imports: [PrismaModule],
  providers: [ApiTokensService, ApiTokenGuard],
  controllers: [ApiTokensController, PublicApiController],
  exports: [ApiTokensService],
})
export class ApiTokensModule {}
