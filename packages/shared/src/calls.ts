import { z } from 'zod';

/**
 * Voice / video calls (Tier 8.B).
 *
 * A peer-to-peer audio/video call anchored to an existing chat
 * conversation. Authorization piggybacks on `ConversationParticipant`
 * (same pattern as Tier 8.C interviews), so the only new ACL surface is
 * the per-call `CallParticipant` row that holds the short-lived join
 * token. The actual media is brokered by an external `CallsProvider`
 * (Cloudflare Calls by default; pluggable so we can swap to Twilio /
 * self-hosted Coturn without schema changes).
 *
 * Wire format here is deliberately minimal — the client only needs the
 * call id, type, status, and the per-user join material. Provider
 * specifics (TURN credentials, app id) are bundled into
 * `joinDescriptor` so a future provider swap is one server-side change.
 */

export const callTypeSchema = z.enum(['AUDIO', 'VIDEO']);
export type CallType = z.infer<typeof callTypeSchema>;

export const callStatusSchema = z.enum([
  'RINGING',
  'ACTIVE',
  'ENDED',
  'MISSED',
  'REJECTED',
]);
export type CallStatus = z.infer<typeof callStatusSchema>;

/** Cloudflare Calls + Twilio + LiveKit all expect the client to obtain
 *  a short-lived join token (≈ 10 min). We never let it outlive the
 *  call itself; renewing requires a fresh `POST /calls/:id/join`. */
export const CALL_JOIN_TOKEN_TTL_SEC = 10 * 60;

/** Auto-cancel a RINGING call after this many seconds with no accept.
 *  Mirrors typical telephony behaviour and bounds the open-call set. */
export const CALL_RING_TIMEOUT_SEC = 60;

/** Hard ceiling on a single call's wall-clock length. After this we
 *  end the row server-side regardless of provider state, so durationSec
 *  stays bounded for analytics. */
export const CALL_MAX_DURATION_SEC = 4 * 60 * 60;

export const createCallSchema = z.object({
  conversationId: z.string().min(1),
  type: callTypeSchema.default('VIDEO'),
});
export type CreateCallInput = z.infer<typeof createCallSchema>;

export const endCallSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .default({});
export type EndCallInput = z.infer<typeof endCallSchema>;

export const listCallsQuerySchema = z.object({
  conversationId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;

/** Provider-shaped descriptor returned to the client. Opaque to us;
 *  the client SDK consumes it as-is. */
export interface CallJoinDescriptor {
  /** Provider key — `cloudflare` or `stub`. */
  provider: string;
  /** Provider-issued session/room id. */
  sessionId: string;
  /** Per-user join token. Bearer; expires at `expiresAt`. */
  token: string;
  /** ISO-8601 expiry of the token. */
  expiresAt: string;
  /** Optional ICE servers for WebRTC peers. Bundled here so the client
   *  doesn't need a second round-trip. */
  iceServers?: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  /** Provider app id (required by Cloudflare Calls JS SDK). */
  appId?: string;
}

export interface CallParticipantSummary {
  userId: string;
  name: string;
  role: string;
  avatarUrl: string | null;
  joinedAt: string | null;
  leftAt: string | null;
}

export interface CallDto {
  id: string;
  conversationId: string;
  type: CallType;
  status: CallStatus;
  initiatorId: string;
  startedAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  endReason: string | null;
  createdAt: string;
  participants: CallParticipantSummary[];
}

/** Returned to the caller of `POST /calls` and `POST /calls/:id/join`.
 *  Carries both the persisted call row and the provider join material
 *  so the client has everything it needs in one round-trip. */
export interface CallSession {
  call: CallDto;
  join: CallJoinDescriptor;
}

/** WebSocket events emitted on `conv:<conversationId>` rooms. The wire
 *  shape is documented here so the client side can stay in lockstep
 *  even though the gateway lives in the API package. */
export type CallEvent =
  | { type: 'call:incoming'; call: CallDto }
  | { type: 'call:accepted'; callId: string; userId: string }
  | { type: 'call:rejected'; callId: string; userId: string }
  | { type: 'call:ended'; callId: string; endedById: string | null; endReason: string | null };
