// =========================================================================
// T9.E — KYC (Know Your Customer) provider abstraction
// =========================================================================
//
// `VerificationRequest` (already shipped in T5.A) is the *manual* document
// review for a Company or Trainer profile (logo, business license, portfolio
// attestation). KYC is the orthogonal **individual identity** layer — proof
// that the human behind a User account is who they claim to be — and is
// normally driven by a third-party provider (Onfido / Persona / Stripe
// Identity / etc).
//
// The provider integration is abstracted behind a `KycProvider` interface
// so we can ship a `Stub` implementation (auto-approve after a configurable
// delay) for development + CI today, and swap in a real provider with a
// one-line DI change once credentials are available.

import { z } from 'zod';

export const KycSessionStatuses = [
  'PENDING',
  'AWAITING_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
] as const;
export type KycSessionStatusLiteral = (typeof KycSessionStatuses)[number];

export const KycProviderNames = ['STUB', 'ONFIDO', 'PERSONA', 'STRIPE_IDENTITY'] as const;
export type KycProviderNameLiteral = (typeof KycProviderNames)[number];

export const KycDocumentTypes = ['PASSPORT', 'NATIONAL_ID', 'DRIVER_LICENSE'] as const;
export type KycDocumentTypeLiteral = (typeof KycDocumentTypes)[number];

/// Single document attached to a KYC session — uploaded through the existing
/// presigned-URL infra (T1.E PR B1) and referenced by storage key + a server
/// side-of-truth `side` (front / back / selfie).
export const kycDocumentSchema = z.object({
  key: z.string().min(1).max(512),
  side: z.enum(['FRONT', 'BACK', 'SELFIE']),
  contentType: z.string().min(1).max(120).optional(),
  uploadedAt: z.string().datetime().optional(),
});
export type KycDocument = z.infer<typeof kycDocumentSchema>;

/// Open a fresh session. The server picks the provider via env config; the
/// client only declares which document it intends to submit so the provider
/// session can be pre-configured (Onfido needs the document type up-front).
export const startKycSchema = z.object({
  documentType: z.enum(KycDocumentTypes),
  documentCountry: z
    .string()
    .regex(/^[A-Z]{2}$/, 'documentCountry must be an ISO 3166-1 alpha-2 code'),
});
export type StartKycInput = z.infer<typeof startKycSchema>;

/// Mark a session as ready for review. Documents must already be uploaded
/// via the presigned URL flow.
export const submitKycSchema = z.object({
  documents: z.array(kycDocumentSchema).min(1).max(5),
});
export type SubmitKycInput = z.infer<typeof submitKycSchema>;

/// Admin-side queue listing.
export const adminListKycQuerySchema = z.object({
  status: z.enum(KycSessionStatuses).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type AdminListKycQuery = z.infer<typeof adminListKycQuerySchema>;

/// Admin decision payload.
export const reviewKycSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  decisionReason: z.string().max(2000).optional(),
});
export type ReviewKycInput = z.infer<typeof reviewKycSchema>;

/// Provider abstraction. `apps/api` wires a concrete implementation in DI.
export interface KycProviderSession {
  providerSessionId: string;
  expiresAt: Date | null;
}

export interface KycProviderDecision {
  status: 'APPROVED' | 'REJECTED' | 'AWAITING_REVIEW';
  reason: string | null;
}

export interface KycProvider {
  readonly name: KycProviderNameLiteral;
  /// Open a remote session and return its ID. The remote system holds the
  /// session, we just persist a pointer for later webhook correlation.
  createSession(input: StartKycInput & { userId: string }): Promise<KycProviderSession>;
  /// Submit the uploaded documents for the remote review pipeline. Some
  /// providers (Stripe Identity) auto-decide synchronously, others
  /// (Onfido / Persona) return AWAITING_REVIEW and call back via webhook.
  submitDocuments(args: {
    providerSessionId: string;
    documents: KycDocument[];
  }): Promise<KycProviderDecision>;
}
