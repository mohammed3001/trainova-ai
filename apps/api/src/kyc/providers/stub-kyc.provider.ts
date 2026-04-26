import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  KycProvider,
  KycProviderDecision,
  KycProviderSession,
  KycDocument,
  StartKycInput,
} from '@trainova/shared';

/**
 * Development / CI provider. Returns synthetic session IDs and auto-decides
 * synchronously based on a coarse heuristic so we can exercise the full
 * happy-path + reject path without external credentials:
 *
 * - 1 document only           → REJECT  ("documents incomplete")
 * - documentCountry === 'XX'  → REJECT  ("synthetic-fail country code")
 * - everything else            → APPROVED
 *
 * Real providers (Onfido, Persona, Stripe Identity) plug in via the same
 * `KycProvider` interface; in those cases `submitDocuments` will typically
 * return `AWAITING_REVIEW` and the actual decision flows in via webhook.
 */
@Injectable()
export class StubKycProvider implements KycProvider {
  readonly name = 'STUB' as const;
  private readonly logger = new Logger(StubKycProvider.name);

  async createSession(input: StartKycInput & { userId: string }): Promise<KycProviderSession> {
    const providerSessionId = `stub_${randomBytes(8).toString('hex')}`;
    this.logger.log(
      `[STUB] createSession user=${input.userId} doc=${input.documentType} country=${input.documentCountry} → ${providerSessionId}`,
    );
    return {
      providerSessionId,
      // 24h synthetic expiry so the row's expiresAt mirrors what a real
      // provider would return; not enforced server-side, just informative.
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async submitDocuments(args: {
    providerSessionId: string;
    documents: KycDocument[];
  }): Promise<KycProviderDecision> {
    if (args.documents.length < 2) {
      return { status: 'REJECTED', reason: 'Documents incomplete (front + selfie required)' };
    }
    return { status: 'APPROVED', reason: null };
  }
}

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');
