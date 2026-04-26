import { createHmac } from 'node:crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { CALL_JOIN_TOKEN_TTL_SEC } from '@trainova/shared';
import type {
  CallsProvider,
  CreateCallSessionInput,
  MintJoinTokenInput,
  ProviderJoinDescriptor,
} from './calls-provider';

/**
 * Cloudflare Calls (https://developers.cloudflare.com/calls/) provider.
 *
 * Configuration via env (all required when this provider is selected):
 * - `CLOUDFLARE_CALLS_APP_ID` — the Calls app id from the dashboard.
 * - `CLOUDFLARE_CALLS_APP_SECRET` — the matching app secret.
 * - `CLOUDFLARE_CALLS_TURN_KEY_ID` (optional) — TURN keys app id.
 * - `CLOUDFLARE_CALLS_TURN_API_TOKEN` (optional) — TURN keys API token.
 *
 * If the TURN env is unset, we still return a working `appId + token`
 * combo and let the client fall back to STUN-only / browser defaults
 * (Cloudflare Calls infrastructure handles relay internally).
 *
 * The Calls "session" concept maps onto a `Call` row 1:1 — we mint one
 * session per call and rotate per-user tokens via `mintJoinToken`.
 */
@Injectable()
export class CloudflareCallsProvider implements CallsProvider {
  readonly key = 'cloudflare';
  private readonly logger = new Logger(CloudflareCallsProvider.name);
  private readonly appId = process.env.CLOUDFLARE_CALLS_APP_ID ?? '';
  private readonly appSecret = process.env.CLOUDFLARE_CALLS_APP_SECRET ?? '';
  private readonly turnKeyId = process.env.CLOUDFLARE_CALLS_TURN_KEY_ID ?? '';
  private readonly turnApiToken = process.env.CLOUDFLARE_CALLS_TURN_API_TOKEN ?? '';
  private readonly baseUrl =
    process.env.CLOUDFLARE_CALLS_BASE_URL ?? 'https://rtc.live.cloudflare.com/v1';

  async createSession(input: CreateCallSessionInput): Promise<{ sessionId: string }> {
    this.assertConfigured();
    const url = `${this.baseUrl}/apps/${this.appId}/sessions/new`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.appSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(
        `Cloudflare Calls createSession failed: ${res.status} ${body.slice(0, 256)}`,
      );
      throw new ServiceUnavailableException('Calls provider unavailable');
    }
    const data = (await res.json()) as { sessionId?: string };
    if (!data.sessionId) {
      this.logger.error('Cloudflare Calls createSession returned no sessionId');
      throw new ServiceUnavailableException('Calls provider unavailable');
    }
    this.logger.debug(`createSession ${data.sessionId} type=${input.type}`);
    return { sessionId: data.sessionId };
  }

  async mintJoinToken(input: MintJoinTokenInput): Promise<ProviderJoinDescriptor> {
    this.assertConfigured();
    // Cloudflare Calls authorizes client-side SDK calls with the app
    // secret directly. To avoid leaking the secret, we mint a short-
    // lived signed token bound to (sessionId, userId, exp) that our
    // reverse-proxy can verify on /calls/proxy/* if we ever route
    // through it. Absent the proxy, the client uses the appId + token
    // pair to identify itself when calling Cloudflare's API directly,
    // and the Calls app secret never leaves the server.
    const expiresAtMs = Date.now() + CALL_JOIN_TOKEN_TTL_SEC * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const payload = `${input.sessionId}.${input.userId}.${expiresAtMs}`;
    const sig = createHmac('sha256', this.appSecret).update(payload).digest('hex');
    const token = `${payload}.${sig}`;

    const iceServers = await this.fetchIceServers().catch((err) => {
      this.logger.warn(
        `Cloudflare Calls TURN fetch failed; client will fall back: ${(err as Error).message}`,
      );
      return undefined;
    });

    return {
      token,
      expiresAt,
      iceServers,
      appId: this.appId,
    };
  }

  async endSession(sessionId: string): Promise<void> {
    if (!this.appId || !this.appSecret) return;
    const url = `${this.baseUrl}/apps/${this.appId}/sessions/${sessionId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.appSecret}` },
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '');
      // Best-effort — never throw out of endSession; the call row is
      // already marked ENDED locally.
      this.logger.warn(
        `Cloudflare Calls endSession failed: ${res.status} ${body.slice(0, 256)}`,
      );
    }
  }

  private assertConfigured() {
    if (!this.appId || !this.appSecret) {
      throw new ServiceUnavailableException(
        'Cloudflare Calls provider is not configured',
      );
    }
  }

  private async fetchIceServers() {
    if (!this.turnKeyId || !this.turnApiToken) return undefined;
    const url = `${this.baseUrl}/turn/keys/${this.turnKeyId}/credentials/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.turnApiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: CALL_JOIN_TOKEN_TTL_SEC }),
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { iceServers?: ProviderJoinDescriptor['iceServers'] };
    return data.iceServers;
  }
}
