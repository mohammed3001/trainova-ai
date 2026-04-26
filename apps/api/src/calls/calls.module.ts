import { Logger, Module, Provider } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CallsController } from './calls.controller';
import { CallsGateway } from './calls.gateway';
import { CallsService } from './calls.service';
import { CALLS_PROVIDER, type CallsProvider } from './providers/calls-provider';
import { CloudflareCallsProvider } from './providers/cloudflare-calls.provider';
import { StubCallsProvider } from './providers/stub-calls.provider';

const callsProviderFactory: Provider = {
  provide: CALLS_PROVIDER,
  // Both candidate impls are constructed (cheap, no I/O) and the
  // factory picks one based on `CALLS_PROVIDER` + Cloudflare creds. We
  // fall back to `stub` in any non-cloudflare configuration so dev /
  // CI / Devin sandboxes work without external secrets.
  useFactory: (
    cloudflare: CloudflareCallsProvider,
    stub: StubCallsProvider,
  ): CallsProvider => {
    const logger = new Logger('CallsProviderFactory');
    const choice = (process.env.CALLS_PROVIDER ?? '').toLowerCase();
    if (choice === 'cloudflare') {
      if (process.env.CLOUDFLARE_CALLS_APP_ID && process.env.CLOUDFLARE_CALLS_APP_SECRET) {
        logger.log('Using Cloudflare Calls provider');
        return cloudflare;
      }
      logger.warn(
        'CALLS_PROVIDER=cloudflare but Cloudflare creds missing; falling back to stub',
      );
    }
    logger.log('Using stub Calls provider');
    return stub;
  },
  inject: [CloudflareCallsProvider, StubCallsProvider],
};

/**
 * T8.B — voice/video calls. Imports `AuthModule` for `JwtService` so
 * the WS gateway can verify ws-tickets, mirroring the chat gateway.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CallsController],
  providers: [
    CallsService,
    CallsGateway,
    StubCallsProvider,
    CloudflareCallsProvider,
    callsProviderFactory,
  ],
  exports: [CallsService],
})
export class CallsModule {}
