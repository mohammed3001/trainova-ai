import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CALL_MAX_DURATION_SEC,
  type CallDto,
  type CallJoinDescriptor,
  type CallParticipantSummary,
  type CallSession,
  type CreateCallInput,
  type EndCallInput,
  type ListCallsQuery,
} from '@trainova/shared';
import type { Call, CallParticipant, User } from '@trainova/db';
import { PrismaService } from '../prisma/prisma.service';
import { CALLS_PROVIDER, type CallsProvider } from './providers/calls-provider';

type CallWithParticipants = Call & {
  participants: Array<CallParticipant & { user: Pick<User, 'id' | 'name' | 'role' | 'avatarUrl'> }>;
};

/**
 * T8.B — voice/video calls anchored to chat conversations.
 *
 * Authorization model: every endpoint checks that the acting user is a
 * `ConversationParticipant` on `Call.conversationId`. This piggybacks on
 * the chat ACL — there is no separate "can call" permission. We refuse
 * calls on `lockedAt` conversations so a banned thread can't be used
 * to initiate WebRTC media.
 *
 * Provider model: the actual SFU is behind `CallsProvider`. We persist
 * `Call.provider` on the row so historical data stays readable after a
 * future provider swap. Per-user join tokens are minted lazily and
 * stored on `CallParticipant` so a transient disconnect/rejoin is
 * cheap, while a leaked token from an earlier session can't be reused
 * past `joinTokenExpiresAt`.
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CALLS_PROVIDER) private readonly provider: CallsProvider,
  ) {}

  // ===================================================================
  // Mutations
  // ===================================================================

  async create(
    userId: string,
    input: CreateCallInput,
  ): Promise<CallSession & { isNew: boolean }> {
    const ctx = await this.loadConversationContext(userId, input.conversationId);

    // One active call per conversation. If a row is RINGING/ACTIVE we
    // either return it (initiator re-arming the UI) or 409 (someone
    // else is already on the line). The `isNew` flag lets the
    // controller decide whether to broadcast a fresh `call:incoming`
    // event — re-arming an existing call must not re-ring callees.
    const live = await this.prisma.call.findFirst({
      where: {
        conversationId: input.conversationId,
        status: { in: ['RINGING', 'ACTIVE'] },
      },
      include: this.participantInclude(),
      orderBy: { createdAt: 'desc' },
    });
    if (live) {
      if (live.initiatorId !== userId) {
        throw new ConflictException('Another call is already in progress on this conversation');
      }
      const join = await this.mintJoinFor(live, userId, ctx.callerName);
      return { call: this.toDto(live), join, isNew: false };
    }

    const created = await this.prisma.call.create({
      data: {
        conversationId: input.conversationId,
        initiatorId: userId,
        type: input.type,
        provider: this.provider.key,
        participants: {
          createMany: {
            data: ctx.participantIds.map((uid) => ({ userId: uid })),
          },
        },
      },
      include: this.participantInclude(),
    });

    let providerSessionId: string;
    try {
      const session = await this.provider.createSession({
        callId: created.id,
        type: created.type,
      });
      providerSessionId = session.sessionId;
    } catch (err) {
      // Provider failed — the row exists but is unusable. Mark it
      // ENDED with reason so it doesn't pollute "active call" lookups.
      this.logger.error(
        `Calls provider createSession failed for ${created.id}: ${(err as Error).message}`,
      );
      await this.prisma.call.update({
        where: { id: created.id },
        data: {
          status: 'ENDED',
          endedAt: new Date(),
          endReason: 'provider_unavailable',
        },
      });
      throw err;
    }

    const withSession = await this.prisma.call.update({
      where: { id: created.id },
      data: { providerSessionId },
      include: this.participantInclude(),
    });

    const join = await this.mintJoinFor(withSession, userId, ctx.callerName);
    return { call: this.toDto(withSession), join, isNew: true };
  }

  async accept(
    userId: string,
    callId: string,
  ): Promise<CallSession & { changed: boolean }> {
    const call = await this.loadCall(callId);
    await this.assertParticipant(call, userId);
    const wasActive = call.status === 'ACTIVE';
    if (!wasActive && call.status !== 'RINGING') {
      throw new ConflictException(`Cannot accept a ${call.status} call`);
    }
    if (call.initiatorId === userId) {
      throw new BadRequestException('Initiator cannot accept their own call');
    }
    const updated = wasActive
      ? call
      : await this.prisma.call.update({
          where: { id: call.id },
          data: { status: 'ACTIVE', startedAt: new Date() },
          include: this.participantInclude(),
        });
    const me = await this.loadDisplayName(userId);
    const join = await this.mintJoinFor(updated, userId, me);
    // `changed=false` on the idempotent re-accept path lets the
    // controller skip the WS broadcast — re-accepting an already-ACTIVE
    // call (e.g. after a tab reload) must not duplicate `call:accepted`.
    return { call: this.toDto(updated), join, changed: !wasActive };
  }

  async reject(userId: string, callId: string): Promise<CallDto> {
    const call = await this.loadCall(callId);
    await this.assertParticipant(call, userId);
    if (call.status !== 'RINGING') {
      throw new ConflictException(`Cannot reject a ${call.status} call`);
    }
    if (call.initiatorId === userId) {
      throw new BadRequestException('Initiator cannot reject their own call');
    }
    const ended = await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: 'REJECTED',
        endedAt: new Date(),
        endedById: userId,
        endReason: 'rejected',
      },
      include: this.participantInclude(),
    });
    void this.bestEffortEndProvider(ended);
    return this.toDto(ended);
  }

  async end(
    userId: string,
    callId: string,
    input: EndCallInput,
  ): Promise<{ call: CallDto; changed: boolean }> {
    const call = await this.loadCall(callId);
    await this.assertParticipant(call, userId);
    if (call.status === 'ENDED' || call.status === 'REJECTED' || call.status === 'MISSED') {
      // Idempotent — caller may end a call that was already torn down
      // by the other side. `changed=false` lets the controller skip
      // the WS broadcast so callees don't see a duplicate
      // `call:ended` event with the wrong `endedById`.
      return { call: this.toDto(call), changed: false };
    }

    const now = new Date();
    let durationSec: number | null = null;
    let nextStatus: 'ENDED' | 'MISSED' = 'ENDED';
    if (call.status === 'RINGING') {
      // Caller hung up before the other side answered.
      nextStatus = call.initiatorId === userId ? 'MISSED' : 'ENDED';
    } else if (call.status === 'ACTIVE' && call.startedAt) {
      durationSec = Math.max(
        0,
        Math.min(
          CALL_MAX_DURATION_SEC,
          Math.floor((now.getTime() - call.startedAt.getTime()) / 1000),
        ),
      );
    }

    const ended = await this.prisma.call.update({
      where: { id: call.id },
      data: {
        status: nextStatus,
        endedAt: now,
        endedById: userId,
        endReason: input.reason ?? (nextStatus === 'MISSED' ? 'missed' : 'hangup'),
        durationSec,
      },
      include: this.participantInclude(),
    });
    void this.bestEffortEndProvider(ended);
    return { call: this.toDto(ended), changed: true };
  }

  // ===================================================================
  // Reads
  // ===================================================================

  async getById(userId: string, callId: string): Promise<CallDto> {
    const call = await this.loadCall(callId);
    await this.assertParticipant(call, userId);
    return this.toDto(call);
  }

  async list(userId: string, query: ListCallsQuery): Promise<{ items: CallDto[]; total: number }> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: query.conversationId, userId },
      },
      select: { id: true },
    });
    if (!participant) {
      const exists = await this.prisma.conversation.findUnique({
        where: { id: query.conversationId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Conversation not found');
      throw new ForbiddenException('Not a participant');
    }

    const [items, total] = await Promise.all([
      this.prisma.call.findMany({
        where: { conversationId: query.conversationId },
        orderBy: { createdAt: 'desc' },
        take: query.limit,
        skip: query.offset,
        include: this.participantInclude(),
      }),
      this.prisma.call.count({ where: { conversationId: query.conversationId } }),
    ]);

    return { items: items.map((c) => this.toDto(c)), total };
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private async loadCall(callId: string): Promise<CallWithParticipants> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: this.participantInclude(),
    });
    if (!call) throw new NotFoundException('Call not found');
    return call;
  }

  private async assertParticipant(call: CallWithParticipants, userId: string) {
    if (call.participants.some((p) => p.userId === userId)) return;
    // Fall back to the conversation participant list — `participants`
    // on the call row only includes users we expected at create time;
    // a CompanyMember added to the chat after the call started may
    // legitimately need read access to the row.
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: call.conversationId, userId } },
      select: { id: true },
    });
    if (!part) throw new ForbiddenException('Not a participant');
  }

  private async loadConversationContext(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.lockedAt) throw new ForbiddenException('Conversation is locked');
    const me = conversation.participants.find((p) => p.userId === userId);
    if (!me) throw new ForbiddenException('Not a participant');
    if (conversation.participants.length < 2) {
      throw new BadRequestException('Conversation needs at least two participants for a call');
    }
    return {
      participantIds: conversation.participants.map((p) => p.userId),
      callerName: me.user.name,
    };
  }

  private async loadDisplayName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name ?? 'Unknown';
  }

  private participantInclude() {
    return {
      participants: {
        include: {
          user: {
            select: { id: true, name: true, role: true, avatarUrl: true },
          },
        },
      },
    } as const;
  }

  /** Mint (or rotate) the per-user join token on `CallParticipant`. */
  private async mintJoinFor(
    call: CallWithParticipants,
    userId: string,
    displayName: string,
  ): Promise<CallJoinDescriptor> {
    if (!call.providerSessionId) {
      throw new ConflictException('Call has no provider session yet');
    }
    const desc = await this.provider.mintJoinToken({
      sessionId: call.providerSessionId,
      callId: call.id,
      userId,
      displayName,
      isInitiator: call.initiatorId === userId,
    });
    // Upsert keeps the row when a CompanyMember was added after create.
    await this.prisma.callParticipant.upsert({
      where: { callId_userId: { callId: call.id, userId } },
      create: {
        callId: call.id,
        userId,
        joinedAt: new Date(),
        joinToken: desc.token,
        joinTokenExpiresAt: new Date(desc.expiresAt),
      },
      update: {
        joinedAt: new Date(),
        joinToken: desc.token,
        joinTokenExpiresAt: new Date(desc.expiresAt),
      },
    });
    return {
      provider: this.provider.key,
      sessionId: call.providerSessionId,
      token: desc.token,
      expiresAt: desc.expiresAt,
      iceServers: desc.iceServers,
      appId: desc.appId,
    };
  }

  private bestEffortEndProvider(call: CallWithParticipants): Promise<void> {
    if (!call.providerSessionId) return Promise.resolve();
    return this.provider
      .endSession(call.providerSessionId)
      .catch((err) =>
        this.logger.warn(
          `Calls provider endSession failed for ${call.id}: ${(err as Error).message}`,
        ),
      );
  }

  private toDto(call: CallWithParticipants): CallDto {
    const participants: CallParticipantSummary[] = call.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      role: p.user.role,
      avatarUrl: p.user.avatarUrl,
      joinedAt: p.joinedAt ? p.joinedAt.toISOString() : null,
      leftAt: p.leftAt ? p.leftAt.toISOString() : null,
    }));
    return {
      id: call.id,
      conversationId: call.conversationId,
      type: call.type,
      status: call.status,
      initiatorId: call.initiatorId,
      startedAt: call.startedAt ? call.startedAt.toISOString() : null,
      endedAt: call.endedAt ? call.endedAt.toISOString() : null,
      durationSec: call.durationSec,
      endReason: call.endReason,
      createdAt: call.createdAt.toISOString(),
      participants,
    };
  }
}
