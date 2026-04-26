import { randomBytes, createHmac } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@trainova/db';
import {
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
  type WebhookEnvelope,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type ListWebhookDeliveriesQuery,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Backoff schedule for failed deliveries. Position N = ms-delay
 * before attempt N+1 (so element 0 = delay before the *2nd* attempt).
 * Past the end ⇒ ABANDONED. Hand-picked rather than pure exponential
 * so the early retries are aggressive (network blips) and the late
 * ones widely spaced (subscriber outages).
 */
const RETRY_BACKOFF_MS = [
  60_000, // 1 min
  5 * 60_000, // 5 min
  30 * 60_000, // 30 min
  2 * 60 * 60_000, // 2 h
  6 * 60 * 60_000, // 6 h
  24 * 60 * 60_000, // 24 h
];
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1; // first try + retries

/**
 * After this many *consecutive* terminal failures across deliveries,
 * we auto-disable the webhook so a permanently dead endpoint doesn't
 * churn deliveries forever. Reset on the first 2xx delivery.
 */
const AUTO_DISABLE_THRESHOLD = 20;

/** Per-attempt timeout for the outbound HTTP POST. */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Cap on how many deliveries the cron worker processes per tick.
 *  Tuned so a single Postgres + outbound burst can't starve the
 *  request loop on a 1-vCPU container. */
const CRON_BATCH_SIZE = 50;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // CRUD (company-scoped)
  // -------------------------------------------------------------

  async list(companyId: string) {
    const rows = await this.prisma.webhook.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        url: true,
        events: true,
        description: true,
        enabled: true,
        failureCount: true,
        disabledAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  async create(companyId: string, input: CreateWebhookInput) {
    const secret = this.generateSecret();
    const created = await this.prisma.webhook.create({
      data: {
        companyId,
        url: input.url,
        secret,
        events: input.events ?? [],
        description: input.description,
      },
    });
    // The secret is the *only* time the company sees it in plaintext.
    // After this we expose `secretLast4` for identification only —
    // rotate to invalidate.
    return {
      id: created.id,
      url: created.url,
      events: created.events,
      description: created.description,
      enabled: created.enabled,
      secret,
      createdAt: created.createdAt,
    };
  }

  async update(companyId: string, id: string, input: UpdateWebhookInput) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook not found');
    if (existing.companyId !== companyId) throw new ForbiddenException();
    const next = await this.prisma.webhook.update({
      where: { id },
      data: {
        url: input.url ?? undefined,
        events: input.events ?? undefined,
        description: input.description === null ? null : input.description ?? undefined,
        enabled: input.enabled ?? undefined,
        // Re-enabling a webhook clears the auto-disable bookkeeping;
        // the next failure starts the count from zero again.
        ...(input.enabled === true
          ? { disabledAt: null, failureCount: 0 }
          : {}),
      },
    });
    return {
      id: next.id,
      url: next.url,
      events: next.events,
      description: next.description,
      enabled: next.enabled,
      failureCount: next.failureCount,
      disabledAt: next.disabledAt,
      createdAt: next.createdAt,
      updatedAt: next.updatedAt,
    };
  }

  async remove(companyId: string, id: string) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook not found');
    if (existing.companyId !== companyId) throw new ForbiddenException();
    await this.prisma.webhook.delete({ where: { id } });
  }

  /** Rotate the signing secret. Returns the new plaintext secret —
   *  same one-shot reveal as `create`. */
  async rotateSecret(companyId: string, id: string) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook not found');
    if (existing.companyId !== companyId) throw new ForbiddenException();
    const secret = this.generateSecret();
    await this.prisma.webhook.update({
      where: { id },
      data: { secret },
    });
    return { id, secret };
  }

  // -------------------------------------------------------------
  // Delivery log (read)
  // -------------------------------------------------------------

  async listDeliveries(companyId: string, id: string, q: ListWebhookDeliveriesQuery) {
    const existing = await this.prisma.webhook.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Webhook not found');
    if (existing.companyId !== companyId) throw new ForbiddenException();
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        webhookId: id,
        status: q.status ?? undefined,
        createdAt: q.before ? { lt: new Date(q.before) } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
      select: {
        id: true,
        eventType: true,
        status: true,
        attempts: true,
        nextAttemptAt: true,
        lastStatus: true,
        lastResponse: true,
        deliveredAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows;
  }

  /** Reset an ABANDONED/FAILED delivery back to PENDING so the cron
   *  worker picks it up immediately. Used by the company-side
   *  "Redeliver" button. */
  async redeliver(companyId: string, webhookId: string, deliveryId: string) {
    const existing = await this.prisma.webhook.findUnique({
      where: { id: webhookId },
    });
    if (!existing) throw new NotFoundException('Webhook not found');
    if (existing.companyId !== companyId) throw new ForbiddenException();
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery || delivery.webhookId !== webhookId) {
      throw new NotFoundException('Delivery not found');
    }
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        attempts: 0,
        nextAttemptAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------
  // Dispatch (called from feature services)
  // -------------------------------------------------------------

  /**
   * Fan out an event to every subscribed webhook in `companyId`. We
   * write one `WebhookDelivery` row per (webhook, event) tuple in a
   * single createMany — the cron worker drives delivery. We
   * deliberately don't deliver synchronously here so a slow
   * subscriber can't backpressure the originating request (e.g. a
   * trainer applying to a job).
   *
   * Failures in this call are swallowed at the Logger level — we
   * treat webhooks as best-effort. The originating action must NOT
   * roll back because a webhook persistence failed.
   */
  async dispatch(
    companyId: string,
    eventType: WebhookEventType,
    data: unknown,
  ): Promise<void> {
    try {
      const subscribers = await this.prisma.webhook.findMany({
        where: {
          companyId,
          enabled: true,
          // events=[] is "subscribe to all"; otherwise the type must
          // be in the array.
          OR: [{ events: { isEmpty: true } }, { events: { has: eventType } }],
        },
        select: { id: true },
      });
      if (subscribers.length === 0) return;
      const now = new Date();
      // Generate one envelope template — each row gets its own copy
      // with a row-specific `id` patched in by the cron worker
      // before signing (the row id IS the envelope id).
      const baseEnvelope: Prisma.InputJsonValue = {
        eventType,
        createdAt: now.toISOString(),
        version: 1,
        // `data` is `unknown` at this layer; serialise it through JSON
        // first so we never persist non-serialisable values (Date,
        // Map, BigInt, ...) and reject silently — a webhook event
        // payload that round-trips JSON is the contract we expose to
        // subscribers.
        data: JSON.parse(JSON.stringify(data ?? null)) as Prisma.InputJsonValue,
      };
      await this.prisma.webhookDelivery.createMany({
        data: subscribers.map((s) => ({
          webhookId: s.id,
          eventType,
          payload: baseEnvelope,
          nextAttemptAt: now,
        })),
      });
    } catch (err) {
      this.logger.warn(
        `webhook dispatch failed for ${eventType} on company=${companyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // -------------------------------------------------------------
  // Cron worker: process pending deliveries
  // -------------------------------------------------------------

  @Cron(CronExpression.EVERY_MINUTE)
  async processPending(): Promise<void> {
    // We deliberately don't run concurrently — a single tick at a
    // batch size of 50 means at most ~50 outbound HTTPs per minute
    // per API instance. Scale by adding instances; the row-level
    // `IN_FLIGHT` claim prevents double-delivery across replicas.
    let due: { id: string }[];
    try {
      due = await this.prisma.webhookDelivery.findMany({
        where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } },
        orderBy: { nextAttemptAt: 'asc' },
        take: CRON_BATCH_SIZE,
        select: { id: true },
      });
    } catch (err) {
      this.logger.error(
        `webhook cron query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    for (const { id } of due) {
      try {
        await this.processOne(id);
      } catch (err) {
        // processOne already swallows attempt failures; an exception
        // here means a programming error / lost connection during
        // the row update. Log and carry on with the rest of the
        // batch.
        this.logger.error(
          `webhook delivery ${id} crashed processOne: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Visible for tests + the company-side "Redeliver" button (which
   * resets to PENDING and waits for the next cron tick — so this
   * stays internal). Atomically claims the row by flipping it to
   * IN_FLIGHT, fires the HTTP, then transitions to SUCCEEDED /
   * FAILED+next-backoff / ABANDONED.
   */
  private async processOne(deliveryId: string): Promise<void> {
    const claim = await this.prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, status: 'PENDING' },
      data: { status: 'IN_FLIGHT' },
    });
    if (claim.count === 0) return; // another replica got it
    const delivery = await this.prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });
    if (!delivery || !delivery.webhook) return;
    if (!delivery.webhook.enabled) {
      // Webhook was disabled between dispatch and this attempt — drop
      // the in-flight back to PENDING and ABANDON so the company
      // sees what happened in the delivery log instead of a silent
      // disappearance.
      await this.prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'ABANDONED', lastResponse: 'webhook disabled' },
      });
      return;
    }

    // Patch the row id into the envelope before signing so the
    // subscriber-visible `id` matches the delivery row id.
    const payloadObj = delivery.payload as Record<string, unknown>;
    const envelope: WebhookEnvelope = {
      id: deliveryId,
      eventType: payloadObj.eventType as WebhookEventType,
      createdAt: String(payloadObj.createdAt),
      version: 1,
      data: payloadObj.data,
    };
    const body = JSON.stringify(envelope);
    const ts = Math.floor(Date.now() / 1000);
    const signature = this.sign(delivery.webhook.secret, ts, body);

    const attempts = delivery.attempts + 1;

    let status: number | null = null;
    let respBody = '';
    let succeeded = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), DELIVERY_TIMEOUT_MS);
      try {
        const r = await fetch(delivery.webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'TrainovaWebhooks/1.0',
            'X-Trainova-Event': delivery.eventType,
            'X-Trainova-Delivery': deliveryId,
            'X-Trainova-Signature': `t=${ts},v1=${signature}`,
          },
          body,
          signal: ctrl.signal,
        });
        status = r.status;
        succeeded = r.status >= 200 && r.status < 300;
        respBody = (await r.text().catch(() => '')).slice(0, 500);
      } finally {
        clearTimeout(t);
      }
    } catch (err) {
      respBody = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    }

    if (succeeded) {
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'SUCCEEDED',
            attempts,
            lastStatus: status,
            lastResponse: respBody,
            deliveredAt: new Date(),
          },
        }),
        this.prisma.webhook.update({
          where: { id: delivery.webhookId },
          data: { failureCount: 0 },
        }),
      ]);
      return;
    }

    if (attempts >= MAX_ATTEMPTS) {
      // Increment company-level failure count and possibly auto-disable.
      const next = await this.prisma.webhook.update({
        where: { id: delivery.webhookId },
        data: { failureCount: { increment: 1 } },
        select: { failureCount: true },
      });
      const shouldDisable = next.failureCount >= AUTO_DISABLE_THRESHOLD;
      await this.prisma.$transaction([
        this.prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: 'ABANDONED',
            attempts,
            lastStatus: status,
            lastResponse: respBody,
          },
        }),
        ...(shouldDisable
          ? [
              this.prisma.webhook.update({
                where: { id: delivery.webhookId },
                data: { enabled: false, disabledAt: new Date() },
              }),
            ]
          : []),
      ]);
      return;
    }

    // FAILED → schedule retry. `delivery.attempts` is the number of
    // attempts *before* this one, so the index is clamped into the
    // schedule range; the `?? last` fallback is for noUncheckedIndex.
    const backoffIdx = Math.min(delivery.attempts, RETRY_BACKOFF_MS.length - 1);
    const backoff =
      RETRY_BACKOFF_MS[backoffIdx] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1] ?? 60_000;
    await this.prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'PENDING',
        attempts,
        lastStatus: status,
        lastResponse: respBody,
        nextAttemptAt: new Date(Date.now() + backoff),
      },
    });
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------

  /**
   * 32-byte secret formatted as `whsec_<hex>` so it's unmistakable in
   * logs / diffs (Stripe convention). Hex (not base64url) is chosen
   * because every documented Sentry/Stripe-style consumer uses hex
   * HMAC verification — pasting the secret into a `crypto.timingSafeEqual`
   * snippet must Just Work without any extra decoding step.
   */
  private generateSecret(): string {
    return `whsec_${randomBytes(32).toString('hex')}`;
  }

  /**
   * Stripe-style HMAC: `t=<unix>,v1=<hex>` with the body prefixed by
   * the timestamp + a `.` separator before HMAC. Subscribers verify
   * by reading `X-Trainova-Signature`, splitting on `,`, recomputing
   * `HMAC_SHA256(secret, t + '.' + body)` and rejecting if the hex
   * doesn't match in constant time, AND if `|now-t|>300s`.
   */
  private sign(secret: string, ts: number, body: string): string {
    return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  }

  /** Exposed for tests / health checks. */
  static get knownEvents(): readonly WebhookEventType[] {
    return WEBHOOK_EVENT_TYPES;
  }
}
