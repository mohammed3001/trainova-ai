import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type InterviewMeeting, type User } from '@trainova/db';
import {
  INTERVIEW_DEFAULT_DURATION_MIN,
  INTERVIEW_MAX_DAYS_AHEAD,
  INTERVIEW_MAX_DURATION_MIN,
  type CancelInterviewInput,
  type CompleteInterviewInput,
  type CreateInterviewInput,
  type InterviewMeetingDto,
  type InterviewParticipantSummary,
  type InterviewStatus,
  type ListInterviewsQuery,
  type RescheduleInterviewInput,
} from '@trainova/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Interview scheduling (Tier 8.C).
 *
 * Authorization is anchored to the underlying chat conversation: only
 * the two `ConversationParticipant`s can see / cancel a meeting, and
 * only the *company-side* participant can create or complete one. The
 * service is deliberately small — every mutation lives inside a single
 * Prisma transaction and emits a SYSTEM message + bell notification so
 * the chat stays the source of truth.
 *
 * Reschedules are modelled as cancel-and-create in one transaction so a
 * partial failure can never leave the calendar with two simultaneously
 * SCHEDULED rows for the same conversation.
 */

const COMPANY_SIDE_ROLES = new Set<User['role']>(['COMPANY_OWNER', 'COMPANY_MEMBER']);

interface InterviewWithRelations extends InterviewMeeting {
  scheduledBy: Pick<User, 'id' | 'name' | 'role' | 'avatarUrl'>;
  trainer: Pick<User, 'id' | 'name' | 'role' | 'avatarUrl'>;
  cancelledBy: Pick<User, 'id' | 'name' | 'role' | 'avatarUrl'> | null;
  rescheduledTo: { id: string } | null;
}

const interviewInclude = {
  scheduledBy: { select: { id: true, name: true, role: true, avatarUrl: true } },
  trainer: { select: { id: true, name: true, role: true, avatarUrl: true } },
  cancelledBy: { select: { id: true, name: true, role: true, avatarUrl: true } },
  rescheduledTo: { select: { id: true } },
} satisfies Prisma.InterviewMeetingInclude;

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ===================================================================
  // Public API
  // ===================================================================

  async create(userId: string, input: CreateInterviewInput): Promise<InterviewMeetingDto> {
    const scheduledAt = this.parseFutureDate(input.scheduledAt);
    this.assertWithinHorizon(scheduledAt);
    this.assertValidTimezone(input.timezone);

    const { conversation, caller, trainerId } = await this.loadConversationContext(
      userId,
      input.conversationId,
    );
    if (!COMPANY_SIDE_ROLES.has(caller.role)) {
      throw new ForbiddenException('Only the company can schedule interviews');
    }
    if (input.applicationId) {
      await this.assertApplicationLinkable(input.applicationId, conversation.requestId, trainerId);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.interviewMeeting.create({
        data: {
          conversationId: input.conversationId,
          applicationId: input.applicationId ?? null,
          scheduledById: userId,
          trainerId,
          scheduledAt,
          durationMin: input.durationMin ?? INTERVIEW_DEFAULT_DURATION_MIN,
          timezone: input.timezone,
          meetingUrl: input.meetingUrl ?? null,
          agenda: input.agenda ?? null,
          notes: input.notes ?? null,
        },
        include: interviewInclude,
      });
      await this.postSystemMessage(
        tx,
        row.conversationId,
        userId,
        this.formatScheduleMessage(row),
      );
      return row;
    });

    await this.notifyOther(created, trainerId, 'scheduled');
    return this.toDto(created, userId);
  }

  async list(userId: string, query: ListInterviewsQuery) {
    if (query.conversationId) {
      // Read-only endpoint — match the chat service convention
      // (see `chat.service.ts`: locked conversations stay readable, only
      // writes are blocked) so a closed engagement still surfaces its
      // past interviews to both sides. We only need participation here;
      // the full `loadConversationContext` would 403 on a locked thread.
      await this.assertConversationParticipant(userId, query.conversationId);
    }

    const now = new Date();
    const where: Prisma.InterviewMeetingWhereInput = {
      OR: [{ scheduledById: userId }, { trainerId: userId }],
      ...(query.conversationId ? { conversationId: query.conversationId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.upcomingOnly
        ? {
            status: 'SCHEDULED',
            // `isUpcoming` on the DTO is `scheduledAt + durationMin >= now`,
            // so the DB-side filter has to be at least as wide as the longest
            // possible meeting — otherwise an in-progress 4-hour interview
            // would be filtered out while still rendering as upcoming.
            scheduledAt: {
              gte: new Date(now.getTime() - INTERVIEW_MAX_DURATION_MIN * 60_000),
            },
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.interviewMeeting.findMany({
        where,
        orderBy: [{ scheduledAt: query.upcomingOnly ? 'asc' : 'desc' }, { createdAt: 'desc' }],
        take: query.limit,
        skip: query.offset,
        include: interviewInclude,
      }),
      this.prisma.interviewMeeting.count({ where }),
    ]);

    return {
      total,
      items: rows.map((r) => this.toDto(r, userId)),
    };
  }

  async getById(userId: string, id: string): Promise<InterviewMeetingDto> {
    const row = await this.prisma.interviewMeeting.findUnique({
      where: { id },
      include: interviewInclude,
    });
    if (!row) throw new NotFoundException('Interview not found');
    this.assertParticipant(row, userId);
    return this.toDto(row, userId);
  }

  async cancel(
    userId: string,
    id: string,
    input: CancelInterviewInput,
  ): Promise<InterviewMeetingDto> {
    const existing = await this.prisma.interviewMeeting.findUnique({
      where: { id },
      include: interviewInclude,
    });
    if (!existing) throw new NotFoundException('Interview not found');
    this.assertParticipant(existing, userId);
    if (existing.status !== 'SCHEDULED') {
      throw new ConflictException(`Cannot cancel a ${existing.status.toLowerCase()} interview`);
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      // Re-read inside the transaction to guarantee the row is still
      // SCHEDULED — guards against two browser tabs racing the same
      // cancel. The previous outer-read was just for participant +
      // 404 checks; without this guard a slow race could quietly
      // overwrite a status set in-between.
      const fresh = await tx.interviewMeeting.findUnique({ where: { id } });
      if (!fresh || fresh.status !== 'SCHEDULED') {
        throw new ConflictException('Interview already finalized');
      }
      const row = await tx.interviewMeeting.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: input.reason ?? null,
        },
        include: interviewInclude,
      });
      await this.postSystemMessage(
        tx,
        row.conversationId,
        userId,
        this.formatCancelMessage(row, input.reason),
      );
      return row;
    });

    const otherUserId = userId === cancelled.trainerId ? cancelled.scheduledById : cancelled.trainerId;
    await this.notifyOther(cancelled, otherUserId, 'cancelled');
    return this.toDto(cancelled, userId);
  }

  async reschedule(
    userId: string,
    id: string,
    input: RescheduleInterviewInput,
  ): Promise<InterviewMeetingDto> {
    const newScheduledAt = this.parseFutureDate(input.scheduledAt);
    this.assertWithinHorizon(newScheduledAt);
    if (input.timezone) this.assertValidTimezone(input.timezone);

    const existing = await this.prisma.interviewMeeting.findUnique({
      where: { id },
      include: interviewInclude,
    });
    if (!existing) throw new NotFoundException('Interview not found');
    if (!COMPANY_SIDE_ROLES.has(existing.scheduledBy.role)) {
      // Defensive: a meeting whose scheduler somehow lost company-side
      // role can't be rescheduled by anyone except admin (out of scope).
      throw new ForbiddenException('Original scheduler is no longer eligible');
    }
    if (existing.scheduledById !== userId) {
      throw new ForbiddenException('Only the company can reschedule');
    }
    if (existing.status !== 'SCHEDULED') {
      throw new ConflictException(`Cannot reschedule a ${existing.status.toLowerCase()} interview`);
    }

    // Resolve "clear field" semantics: explicit null on agenda/notes/url
    // means clear; undefined means leave unchanged.
    const next = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.interviewMeeting.findUnique({ where: { id } });
      if (!fresh || fresh.status !== 'SCHEDULED') {
        throw new ConflictException('Interview already finalized');
      }
      const cancelled = await tx.interviewMeeting.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledById: userId,
          cancelReason: input.reason ?? 'Rescheduled',
        },
        include: interviewInclude,
      });
      const created = await tx.interviewMeeting.create({
        data: {
          conversationId: existing.conversationId,
          applicationId: existing.applicationId,
          scheduledById: userId,
          trainerId: existing.trainerId,
          scheduledAt: newScheduledAt,
          durationMin: input.durationMin ?? existing.durationMin,
          timezone: input.timezone ?? existing.timezone,
          meetingUrl:
            input.meetingUrl === null
              ? null
              : (input.meetingUrl ?? existing.meetingUrl),
          agenda: input.agenda === null ? null : (input.agenda ?? existing.agenda),
          notes: input.notes === null ? null : (input.notes ?? existing.notes),
          rescheduledFromId: cancelled.id,
        },
        include: interviewInclude,
      });
      await this.postSystemMessage(
        tx,
        created.conversationId,
        userId,
        this.formatRescheduleMessage(cancelled, created),
      );
      return created;
    });

    await this.notifyOther(next, existing.trainerId, 'rescheduled');
    return this.toDto(next, userId);
  }

  async complete(
    userId: string,
    id: string,
    input: CompleteInterviewInput,
  ): Promise<InterviewMeetingDto> {
    const existing = await this.prisma.interviewMeeting.findUnique({
      where: { id },
      include: interviewInclude,
    });
    if (!existing) throw new NotFoundException('Interview not found');
    this.assertParticipant(existing, userId);
    if (existing.scheduledById !== userId) {
      throw new ForbiddenException('Only the scheduler can mark an interview complete');
    }
    if (existing.status !== 'SCHEDULED') {
      throw new ConflictException(`Cannot complete a ${existing.status.toLowerCase()} interview`);
    }
    if (existing.scheduledAt.getTime() > Date.now()) {
      throw new BadRequestException('Cannot mark a future interview complete');
    }

    const completed = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.interviewMeeting.findUnique({ where: { id } });
      if (!fresh || fresh.status !== 'SCHEDULED') {
        throw new ConflictException('Interview already finalized');
      }
      const row = await tx.interviewMeeting.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          notes: input.notes ?? fresh.notes,
        },
        include: interviewInclude,
      });
      await this.postSystemMessage(
        tx,
        row.conversationId,
        userId,
        this.formatCompleteMessage(row),
      );
      return row;
    });

    await this.notifyOther(completed, completed.trainerId, 'completed');
    return this.toDto(completed, userId);
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  /**
   * Lightweight participation check used by read-only endpoints. Does
   * NOT enforce `Conversation.lockedAt` — that gate belongs to mutating
   * paths (schedule / reschedule / etc) and would otherwise hide past
   * interviews from a locked thread.
   */
  private async assertConversationParticipant(userId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      select: { id: true },
    });
    if (!participant) {
      // Mask the difference between "no such conversation" and "not a
      // participant" — same response shape as `loadConversationContext`
      // when the user isn't on the participant list.
      const exists = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Conversation not found');
      throw new ForbiddenException('Not a participant');
    }
  }

  private async loadConversationContext(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: { user: { select: { id: true, role: true, name: true, avatarUrl: true } } },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const callerPart = conversation.participants.find((p) => p.userId === userId);
    if (!callerPart) throw new ForbiddenException('Not a participant');
    if (conversation.lockedAt) {
      throw new ForbiddenException('Conversation is locked');
    }
    const trainerPart = conversation.participants.find((p) => p.user.role === 'TRAINER');
    if (!trainerPart) {
      throw new BadRequestException('Conversation has no trainer participant');
    }
    return {
      conversation,
      caller: callerPart.user,
      trainerId: trainerPart.user.id,
    };
  }

  private async assertApplicationLinkable(
    applicationId: string,
    requestId: string | null,
    trainerId: string,
  ) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, requestId: true, trainerId: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.trainerId !== trainerId) {
      throw new BadRequestException('Application does not belong to this trainer');
    }
    if (requestId && application.requestId !== requestId) {
      throw new BadRequestException('Application does not belong to this conversation');
    }
  }

  private parseFutureDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Invalid scheduledAt');
    }
    if (date.getTime() <= Date.now()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    return date;
  }

  private assertWithinHorizon(date: Date) {
    const horizon = Date.now() + INTERVIEW_MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;
    if (date.getTime() > horizon) {
      throw new BadRequestException(
        `scheduledAt cannot be more than ${INTERVIEW_MAX_DAYS_AHEAD} days in the future`,
      );
    }
  }

  private assertValidTimezone(tz: string) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      throw new BadRequestException(`Unknown timezone: ${tz}`);
    }
  }

  private assertParticipant(row: InterviewMeeting, userId: string) {
    if (row.scheduledById !== userId && row.trainerId !== userId) {
      throw new ForbiddenException('Not a participant');
    }
  }

  // -- Messaging / notifications --------------------------------------

  private async postSystemMessage(
    tx: Prisma.TransactionClient,
    conversationId: string,
    senderId: string,
    body: string,
  ) {
    await tx.message.create({
      data: { conversationId, senderId, body, type: 'SYSTEM' },
    });
    await tx.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  private async notifyOther(
    row: InterviewWithRelations,
    recipientId: string,
    kind: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed',
  ) {
    const titles: Record<typeof kind, string> = {
      scheduled: 'Interview scheduled',
      cancelled: 'Interview cancelled',
      rescheduled: 'Interview rescheduled',
      completed: 'Interview marked complete',
    };
    try {
      await this.notifications.emit({
        userId: recipientId,
        type: 'system.announcement',
        payload: {
          title: titles[kind],
          body: this.formatNotificationBody(row, kind),
          href: `/chat/${row.conversationId}`,
          meta: {
            interviewId: row.id,
            conversationId: row.conversationId,
            kind,
          },
        },
      });
    } catch {
      // Non-fatal — meeting row is already authoritative.
    }
  }

  private formatNotificationBody(
    row: InterviewWithRelations,
    kind: 'scheduled' | 'cancelled' | 'rescheduled' | 'completed',
  ) {
    const when = this.formatInTz(row.scheduledAt, row.timezone);
    if (kind === 'cancelled') return `Was scheduled for ${when}.`;
    if (kind === 'completed') return `Marked complete by ${row.scheduledBy.name}.`;
    return `${row.scheduledBy.name} → ${row.trainer.name} • ${when}`;
  }

  private formatScheduleMessage(row: InterviewWithRelations) {
    const when = this.formatInTz(row.scheduledAt, row.timezone);
    const lines = [`📅 Interview scheduled for ${when} (${row.timezone}).`];
    if (row.durationMin) lines.push(`Duration: ${row.durationMin} minutes.`);
    if (row.meetingUrl) lines.push(`Join: ${row.meetingUrl}`);
    if (row.agenda) lines.push(`Agenda: ${row.agenda}`);
    return lines.join('\n');
  }

  private formatCancelMessage(row: InterviewWithRelations, reason: string | undefined) {
    const when = this.formatInTz(row.scheduledAt, row.timezone);
    const tail = reason ? ` Reason: ${reason}` : '';
    return `❌ Interview for ${when} (${row.timezone}) was cancelled.${tail}`;
  }

  private formatRescheduleMessage(
    cancelled: InterviewWithRelations,
    next: InterviewWithRelations,
  ) {
    const oldWhen = this.formatInTz(cancelled.scheduledAt, cancelled.timezone);
    const newWhen = this.formatInTz(next.scheduledAt, next.timezone);
    return `🔁 Interview rescheduled from ${oldWhen} → ${newWhen} (${next.timezone}).`;
  }

  private formatCompleteMessage(row: InterviewWithRelations) {
    const when = this.formatInTz(row.scheduledAt, row.timezone);
    return `✅ Interview from ${when} (${row.timezone}) marked complete.`;
  }

  private formatInTz(date: Date, timezone: string) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
    } catch {
      return date.toISOString();
    }
  }

  private toParticipantSummary(
    user: Pick<User, 'id' | 'name' | 'role' | 'avatarUrl'>,
  ): InterviewParticipantSummary {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl ?? null,
    };
  }

  private toDto(row: InterviewWithRelations, callerId: string): InterviewMeetingDto {
    const endsAt = row.scheduledAt.getTime() + row.durationMin * 60 * 1000;
    return {
      id: row.id,
      conversationId: row.conversationId,
      applicationId: row.applicationId,
      scheduledAt: row.scheduledAt.toISOString(),
      durationMin: row.durationMin,
      timezone: row.timezone,
      meetingUrl: row.meetingUrl,
      agenda: row.agenda,
      notes: row.notes,
      status: row.status as InterviewStatus,
      cancelReason: row.cancelReason,
      cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
      cancelledBy: row.cancelledBy ? this.toParticipantSummary(row.cancelledBy) : null,
      rescheduledFromId: row.rescheduledFromId,
      rescheduledToId: row.rescheduledTo?.id ?? null,
      completedAt: row.completedAt ? row.completedAt.toISOString() : null,
      scheduledBy: this.toParticipantSummary(row.scheduledBy),
      trainer: this.toParticipantSummary(row.trainer),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isUpcoming: row.status === 'SCHEDULED' && endsAt >= Date.now(),
      canManage: row.status === 'SCHEDULED' && row.scheduledById === callerId,
    };
  }
}
