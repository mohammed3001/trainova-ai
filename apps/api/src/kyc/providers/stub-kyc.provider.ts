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

  /**
   * Maps providerSessionId → country code, populated in createSession and read
   * in submitDocuments to honour the documented `'XX' → REJECT` heuristic.
   * The KycProvider interface intentionally hides session metadata from
   * submitDocuments (a real Onfido/Persona webhook flow doesn't have it
   * either), so the stub keeps a private side table here. Memory-only — fine
   * for dev/CI single-process; entries are best-effort GC'd on submit.
   */
  private readonly sessions = new Map<string, { country: string | null }>();

  async createSession(input: StartKycInput & { userId: string }): Promise<KycProviderSession> {
    const providerSessionId = `stub_${randomBytes(8).toString('hex')}`;
    this.sessions.set(providerSessionId, { country: input.documentCountry?.toUpperCase() ?? null });
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
    const meta = this.sessions.get(args.providerSessionId) ?? null;
    this.sessions.delete(args.providerSessionId);

    if (args.documents.length < 2) {
      return { status: 'REJECTED', reason: 'Documents incomplete (front + selfie required)' };
    }
    if (meta?.country === 'XX') {
      return { status: 'REJECTED', reason: 'Synthetic-fail country code (XX)' };
    }
    return { status: 'APPROVED', reason: null };
  }
}

export const KYC_PROVIDER = Symbol('KYC_PROVIDER');
