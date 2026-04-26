/**
 * T8.B — `CallsProvider` is the seam between our signaling/auth model
 * and the external media/SFU service. Concrete implementations are
 * registered behind the `CALLS_PROVIDER` token; the runtime impl is
 * picked in `CallsModule` from `process.env.CALLS_PROVIDER`. The
 * default `stub` provider needs no creds and is suitable for dev /
 * CI; `cloudflare` calls Cloudflare Calls API + TURN.
 *
 * The provider is intentionally narrow:
 * - `createSession` is called once per Call row at create time and
 *   returns an opaque `sessionId` we persist on the row.
 * - `mintJoinToken` is called whenever a participant joins or
 *   re-joins. Tokens are short-lived (`CALL_JOIN_TOKEN_TTL_SEC`) and
 *   bound to (sessionId, userId).
 * - `endSession` is best-effort cleanup; failure here must not break
 *   the local "call ended" transition (we always end the row first
 *   and log provider errors).
 */

import type { CallType } from '@trainova/shared';

export const CALLS_PROVIDER = Symbol('CALLS_PROVIDER');

export interface CreateCallSessionInput {
  callId: string;
  type: CallType;
}

export interface MintJoinTokenInput {
  sessionId: string;
  callId: string;
  userId: string;
  displayName: string;
  /**
   * Whether this participant initiated the call. Some providers grant
   * additional permissions to the initiator (e.g. ability to end the
   * room for everyone).
   */
  isInitiator: boolean;
}

export interface ProviderJoinDescriptor {
  /** Opaque per-user join token. Bearer; client passes to SDK as-is. */
  token: string;
  /** ISO-8601 expiry. */
  expiresAt: string;
  /** Optional ICE servers; only set when the provider returns TURN. */
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Optional provider app id (Cloudflare Calls JS SDK requires it). */
  appId?: string;
}

export interface CallsProvider {
  /** Provider key for the persisted `Call.provider` column. */
  readonly key: string;
  createSession(input: CreateCallSessionInput): Promise<{ sessionId: string }>;
  mintJoinToken(input: MintJoinTokenInput): Promise<ProviderJoinDescriptor>;
  endSession(sessionId: string): Promise<void>;
}
