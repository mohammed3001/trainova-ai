import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import type { CallDto } from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  kind?: string;
}

interface AuthedSocket extends Socket {
  data: { userId: string; role: string };
}

/**
 * T8.B — Socket.IO gateway for call signaling. Mirrors `ChatGateway`'s
 * auth pattern: clients connect with a short-lived `kind=ws` ticket
 * minted by `POST /auth/ws-ticket`, then automatically join the
 * `user:<id>` room. State transitions on a Call are pushed to the
 * existing `conv:<conversationId>` room so chat clients can render
 * incoming-call banners without opening a second socket.
 */
@WebSocketGateway({
  path: '/ws/calls',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class CallsGateway implements OnModuleInit, OnGatewayConnection {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(CallsGateway.name);
  private pub?: Redis;
  private sub?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — calls gateway running in single-instance mode');
      return;
    }
    try {
      this.pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.sub = this.pub.duplicate();
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      this.server.adapter(createAdapter(this.pub, this.sub));
      this.logger.log('Calls gateway Redis adapter attached');
    } catch (err) {
      this.logger.error(`Redis adapter init failed: ${(err as Error).message}`);
      this.pub?.disconnect();
      this.sub?.disconnect();
      this.pub = undefined;
      this.sub = undefined;
    }
  }

  async handleConnection(raw: Socket) {
    const socket = raw as AuthedSocket;
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      (socket.handshake.query?.token as string | undefined);
    if (!token) {
      socket.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      if (payload.kind !== 'ws') {
        socket.disconnect(true);
        return;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, status: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.role !== payload.role) {
        socket.disconnect(true);
        return;
      }
      socket.data.userId = user.id;
      socket.data.role = user.role;
      // Join the per-user room so server-side emitters can target the
      // user across browser tabs / devices.
      socket.join(`user:${user.id}`);
      // Auto-subscribe to every conversation room the user is in so
      // we don't need a separate `subscribe` round-trip for incoming
      // call notifications. The set is bounded by the user's chat
      // graph and changes rarely.
      const parts = await this.prisma.conversationParticipant.findMany({
        where: { userId: user.id },
        select: { conversationId: true },
      });
      for (const p of parts) {
        await socket.join(`conv:${p.conversationId}`);
      }
    } catch {
      socket.disconnect(true);
    }
  }

  // ---------- server-side emitters (called from the controller) ----------

  emitIncoming(call: CallDto) {
    this.server.to(`conv:${call.conversationId}`).emit('call:incoming', { call });
    // Also fan out to the per-user rooms for any participant currently
    // outside the conversation room (e.g. just opened a fresh tab and
    // hasn't joined the conv room yet).
    for (const p of call.participants) {
      this.server.to(`user:${p.userId}`).emit('call:incoming', { call });
    }
  }

  emitAccepted(conversationId: string, callId: string, userId: string) {
    this.server.to(`conv:${conversationId}`).emit('call:accepted', { callId, userId });
  }

  emitRejected(conversationId: string, callId: string, userId: string) {
    this.server.to(`conv:${conversationId}`).emit('call:rejected', { callId, userId });
  }

  emitEnded(
    conversationId: string,
    callId: string,
    endedById: string | null,
    endReason: string | null,
  ) {
    this.server.to(`conv:${conversationId}`).emit('call:ended', {
      callId,
      endedById,
      endReason,
    });
  }
}
