import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@trainova/db';
import {
  type ModelAuthKind,
  type PublicModelCall,
  type WorkbenchCallInput,
  type WorkbenchCallResult,
} from '@trainova/shared';
import { decryptSecret } from '../common/crypto.util';
import { invokeModel, type ProxyCallResult } from '../models/model-proxy';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Gating rules for trainer access to the model proxy:
 *
 *   - The application must belong to the authenticated trainer.
 *   - The job request must have a model connection attached.
 *   - The connection must not be soft-deleted or disabled.
 *   - The application status must be past the initial "applied" gate
 *     (i.e. the company has at least shortlisted / assigned a test).
 *
 * We deliberately do NOT require `ACCEPTED` — the whole point of the
 * workbench is that companies can have trainers *prove* their skill
 * on the live model during evaluation. Rejected / withdrawn
 * applications lose access.
 */
const TRAINER_ACCESS_STATUSES = new Set([
  'SHORTLISTED',
  'TEST_ASSIGNED',
  'TEST_SUBMITTED',
  'INTERVIEW',
  'OFFERED',
  'ACCEPTED',
]);

const MAX_PREVIEW_CHARS = 160;

@Injectable()
export class WorkbenchService {
  constructor(private readonly prisma: PrismaService) {}

  async getContext(userId: string, applicationId: string): Promise<{
    application: {
      id: string;
      status: string;
      requestId: string;
      requestTitle: string;
      requestSlug: string;
    };
    connection: {
      id: string;
      name: string;
      provider: string;
      modelId: string | null;
      status: string;
    } | null;
    canCall: boolean;
    reason: string | null;
  }> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        request: {
          select: {
            id: true,
            title: true,
            slug: true,
            modelConnectionId: true,
            modelConnection: {
              select: {
                id: true,
                name: true,
                provider: true,
                modelId: true,
                status: true,
                deletedAt: true,
              },
            },
          },
        },
      },
    });
    if (!app) throw new NotFoundException('application not found');
    if (app.trainerId !== userId) throw new ForbiddenException('not your application');

    const connection = app.request.modelConnection;
    const connectionPublic =
      connection && !connection.deletedAt
        ? {
            id: connection.id,
            name: connection.name,
            provider: connection.provider as string,
            modelId: connection.modelId,
            status: connection.status as string,
          }
        : null;

    const reason = this.gatingReason(app.status, connectionPublic);
    return {
      application: {
        id: app.id,
        status: app.status,
        requestId: app.request.id,
        requestTitle: app.request.title,
        requestSlug: app.request.slug,
      },
      connection: connectionPublic,
      canCall: reason === null,
      reason,
    };
  }

  async call(
    userId: string,
    applicationId: string,
    input: WorkbenchCallInput,
  ): Promise<WorkbenchCallResult> {
    const ctx = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        request: {
          select: {
            id: true,
            modelConnectionId: true,
            modelConnection: true,
          },
        },
      },
    });
    if (!ctx) throw new NotFoundException('application not found');
    if (ctx.trainerId !== userId) throw new ForbiddenException('not your application');

    const connection = ctx.request.modelConnection;
    const gating = this.gatingReason(
      ctx.status,
      connection && !connection.deletedAt
        ? { status: connection.status as string }
        : null,
    );
    if (gating) throw new ForbiddenException(gating);
    if (!connection) throw new ForbiddenException('no model attached');

    const decrypted = connection.encryptedCredentials
      ? this.tryDecrypt(Buffer.from(connection.encryptedCredentials))
      : '';
    if (connection.encryptedCredentials && !decrypted) {
      throw new BadRequestException(
        'stored credentials could not be decrypted with the current APP_ENCRYPTION_KEY',
      );
    }

    const result = await invokeModel({
      provider: connection.provider as
        | 'OPENAI_COMPATIBLE'
        | 'ANTHROPIC'
        | 'BEDROCK'
        | 'HUGGINGFACE'
        | 'RAW_HTTPS',
      endpointUrl: connection.endpointUrl,
      modelId: connection.modelId,
      region: connection.region,
      authKind: connection.authKind as ModelAuthKind,
      credentials: decrypted,
      call: input,
    });

    const row = await this.persist(
      userId,
      applicationId,
      ctx.request.id,
      connection.id,
      input,
      result,
    );

    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      operation: input.operation,
      outputText: result.outputText,
      raw: result.raw,
      status: result.status,
      latencyMs: result.latencyMs,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costCents: null,
      errorMessage: result.errorMessage,
    };
  }

  async listCallsForTrainer(
    userId: string,
    applicationId: string,
    limit = 50,
  ): Promise<PublicModelCall[]> {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, trainerId: true },
    });
    if (!app) throw new NotFoundException('application not found');
    if (app.trainerId !== userId) throw new ForbiddenException('not your application');

    const rows = await this.prisma.modelCall.findMany({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 200)),
    });
    return rows.map((r) => this.toPublic(r));
  }

  async listCallsForCompany(
    userId: string,
    connectionId: string,
    limit = 100,
  ): Promise<PublicModelCall[]> {
    const conn = await this.prisma.modelConnection.findUnique({
      where: { id: connectionId },
      select: { id: true, companyId: true, company: { select: { ownerId: true } } },
    });
    if (!conn) throw new NotFoundException('connection not found');
    if (conn.company.ownerId !== userId) {
      throw new ForbiddenException('not your company');
    }
    const rows = await this.prisma.modelCall.findMany({
      where: { connectionId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 500)),
    });
    return rows.map((r) => this.toPublic(r));
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  private gatingReason(
    status: string,
    connection: { status: string } | null,
  ): string | null {
    if (!connection) return 'no model attached to this request';
    if (connection.status === 'DISABLED') return 'this connection has been disabled';
    if (connection.status !== 'ACTIVE') {
      return 'this connection has not been activated yet';
    }
    if (!TRAINER_ACCESS_STATUSES.has(status)) {
      return 'workbench access opens after the company shortlists your application';
    }
    return null;
  }

  private async persist(
    trainerId: string,
    applicationId: string,
    jobRequestId: string,
    connectionId: string,
    input: WorkbenchCallInput,
    result: ProxyCallResult,
  ): Promise<{ id: string; createdAt: Date }> {
    // Redact auth-bearing fields before persistence. The proxy strips
    // them upstream, but defense-in-depth keeps `raw` clean even if
    // someone wires a new vendor whose response echoes credentials.
    const sanitizedRequest = this.redact({
      operation: input.operation,
      messages: input.messages,
      prompt: input.prompt,
      input: input.input,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      extra: input.extra,
    }) as Prisma.InputJsonValue;
    const sanitizedResponse: Prisma.InputJsonValue | typeof Prisma.JsonNull =
      result.raw == null
        ? Prisma.JsonNull
        : (this.redact(result.raw) as Prisma.InputJsonValue);

    return this.prisma.modelCall.create({
      data: {
        connectionId,
        applicationId,
        jobRequestId,
        trainerId,
        operation: input.operation,
        requestBody: sanitizedRequest,
        responseBody: sanitizedResponse,
        responseStatus: result.status || null,
        latencyMs: result.latencyMs,
        tokensIn: result.tokensIn ?? null,
        tokensOut: result.tokensOut ?? null,
        costCents: null,
        errorMessage: result.errorMessage,
      },
      select: { id: true, createdAt: true },
    });
  }

  private tryDecrypt(envelope: Buffer): string {
    try {
      return decryptSecret(envelope);
    } catch {
      return '';
    }
  }

  private redact(value: unknown): unknown {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => this.redact(v));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (
        // Exact-match auth/credential keys only — broader substrings like
        // `token` would wipe out legitimate usage metrics such as
        // `maxTokens`, `prompt_tokens`, `completion_tokens`, etc., which
        // we deliberately keep in the audit trail for billing / RLHF.
        /^(authorization|api[-_]?key|x[-_]?api[-_]?key|bearer|secret|password|client[-_]?secret|session[-_]?token|access[-_]?token|refresh[-_]?token|aws[-_]?secret[-_]?access[-_]?key|aws[-_]?access[-_]?key[-_]?id)$/i.test(
          k,
        )
      ) {
        out[k] = '[redacted]';
      } else {
        out[k] = this.redact(v);
      }
    }
    return out;
  }

  private toPublic(row: {
    id: string;
    connectionId: string;
    applicationId: string | null;
    jobRequestId: string | null;
    trainerId: string;
    operation: string;
    requestBody: unknown;
    responseBody: unknown;
    responseStatus: number | null;
    latencyMs: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
    costCents: number | null;
    errorMessage: string | null;
    createdAt: Date;
  }): PublicModelCall {
    return {
      id: row.id,
      connectionId: row.connectionId,
      applicationId: row.applicationId,
      jobRequestId: row.jobRequestId,
      trainerId: row.trainerId,
      operation: row.operation as PublicModelCall['operation'],
      responseStatus: row.responseStatus,
      latencyMs: row.latencyMs,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      costCents: row.costCents,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt.toISOString(),
      requestPreview: buildRequestPreview(row.requestBody),
      responsePreview: buildResponsePreview(row.responseBody),
    };
  }
}

function buildRequestPreview(requestBody: unknown): string {
  if (!requestBody || typeof requestBody !== 'object') return '';
  const obj = requestBody as Record<string, unknown>;
  if (typeof obj.prompt === 'string' && obj.prompt.length > 0) {
    return truncate(obj.prompt, MAX_PREVIEW_CHARS);
  }
  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    const last = obj.messages[obj.messages.length - 1] as
      | { content?: string }
      | undefined;
    if (last?.content) return truncate(last.content, MAX_PREVIEW_CHARS);
  }
  if (typeof obj.input === 'string') return truncate(obj.input, MAX_PREVIEW_CHARS);
  if (Array.isArray(obj.input)) {
    return truncate(obj.input.filter((x) => typeof x === 'string').join(' · '), MAX_PREVIEW_CHARS);
  }
  return '';
}

function buildResponsePreview(responseBody: unknown): string | null {
  if (!responseBody || typeof responseBody !== 'object') return null;
  const obj = responseBody as Record<string, unknown>;
  // OpenAI-style
  const choices = obj.choices as Array<{ message?: { content?: string }; text?: string }> | undefined;
  if (choices?.length) {
    const first = choices[0];
    const text = first?.message?.content ?? first?.text ?? null;
    if (text) return truncate(text, MAX_PREVIEW_CHARS);
  }
  // Anthropic-style
  const content = obj.content as Array<{ type?: string; text?: string }> | undefined;
  if (content?.length) {
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
    if (text) return truncate(text, MAX_PREVIEW_CHARS);
  }
  // HF / generic
  if (Array.isArray(responseBody)) {
    const first = (responseBody as Array<{ generated_text?: string }>)[0];
    if (first?.generated_text) return truncate(first.generated_text, MAX_PREVIEW_CHARS);
  }
  if (typeof obj.generation === 'string') return truncate(obj.generation, MAX_PREVIEW_CHARS);
  if (typeof obj.output === 'string') return truncate(obj.output, MAX_PREVIEW_CHARS);
  return null;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
