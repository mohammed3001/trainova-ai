import { createHmac, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { CALL_JOIN_TOKEN_TTL_SEC } from '@trainova/shared';
import type {
  CallsProvider,
  CreateCallSessionInput,
  MintJoinTokenInput,
  ProviderJoinDescriptor,
} from './calls-provider';

/**
 * In-process Calls provider for dev / CI. Does not talk to any external
 * service; sessions are random ids and tokens are HMAC(sessionId, userId,
 * exp) so the API can later verify a token submitted by a hypothetical
 * dev signaling server. No TURN servers are advertised because this
 * provider is only meant to drive the wire-protocol flow end-to-end —
 * the real SFU is behind `CloudflareCallsProvider`.
 *
 * Why a stub at all: the Calls feature has to ship and pass CI without
 * Cloudflare credentials being available in every Devin sandbox / fork
 * run. The stub keeps `CallsService` and the WebSocket gateway honest
 * and fully exercised in tests.
 */
@Injectable()
export class StubCallsProvider implements CallsProvider {
  readonly key = 'stub';
  private readonly logger = new Logger(StubCallsProvider.name);
  private readonly secret =
    process.env.CALLS_STUB_SECRET ??
    process.env.JWT_ACCESS_SECRET ??
    'dev-calls-stub-secret';

  async createSession(input: CreateCallSessionInput): Promise<{ sessionId: string }> {
    const sessionId = `stub_${input.callId}_${randomBytes(8).toString('hex')}`;
    this.logger.debug(`stub createSession ${sessionId} type=${input.type}`);
    return { sessionId };
  }

  async mintJoinToken(input: MintJoinTokenInput): Promise<ProviderJoinDescriptor> {
    const expiresAtMs = Date.now() + CALL_JOIN_TOKEN_TTL_SEC * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const payload = `${input.sessionId}.${input.userId}.${expiresAtMs}`;
    const sig = createHmac('sha256', this.secret).update(payload).digest('hex');
    return {
      token: `${payload}.${sig}`,
      expiresAt,
    };
  }

  async endSession(sessionId: string): Promise<void> {
    this.logger.debug(`stub endSession ${sessionId}`);
  }
}
