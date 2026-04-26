import { Module } from '@nestjs/common';
import { AdminKycController } from './admin-kyc.controller';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { KYC_PROVIDER, StubKycProvider } from './providers/stub-kyc.provider';

@Module({
  controllers: [KycController, AdminKycController],
  providers: [
    KycService,
    StubKycProvider,
    {
      provide: KYC_PROVIDER,
      // Today: Stub provider, auto-decides synchronously. When credentials
      // are provisioned for a real vendor, swap in `OnfidoKycProvider` /
      // `PersonaKycProvider` here — the rest of the module is untouched.
      useExisting: StubKycProvider,
    },
  ],
  exports: [KycService],
})
export class KycModule {}
