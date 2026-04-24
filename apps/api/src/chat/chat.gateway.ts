import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MessageBody,
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

interface AuthedSocket extends Socket {
  data: { userId: string; role: string };
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  kind?: string;
}

/**
 * Socket.IO gateway for real-time chat. Clients connect to `/ws/chat` using a
 * short-lived ticket from `POST /auth/ws-ticket`, join per-conversation rooms,
 * and receive `message:new`, `typing`, `read:update`, and `presence` events.
 *
 * When REDIS_URL is set, the gateway installs the Redis adapter so events are
 * broadcast across every API instance.
 */
@WebSocketGateway({
  path: '/ws/chat',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class ChatGateway
  implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);
  private pub?: Redis;
  private sub?: Redis;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — chat gateway running in single-instance mode');
      return;
    }
    try {
      this.pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.sub = this.pub.duplicate();
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      this.server.adapter(createAdapter(this.pub, this.sub));
      this.logger.log('Chat gateway Redis adapter attached');
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
      // Require the short-lived ws-ticket kind so long-lived REST access
      // tokens cannot be swapped in to establish a WebSocket.
      if (payload.kind !== 'ws') {
        socket.disconnect(true);
        return;
      }
      // Mirror JwtStrategy.validate(): ensure the user still exists, is
      // ACTIVE, and that the role in the token matches the DB. Prevents
      // a deactivated or role-changed account from holding a live socket.
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
      socket.join(`user:${user.id}`);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(_socket: Socket) {
    // No-op for now; presence tracking is derived from socket rooms.
  }

  @SubscribeMessage('conversation:join')
  async onJoin(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const { conversationId } = body ?? {};
    if (!conversationId) return { ok: false };
    const part = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: socket.data.userId } },
    });
    if (!part) return { ok: false };
    await socket.join(`conv:${conversationId}`);
    socket.to(`conv:${conversationId}`).emit('presence', {
      conversationId,
      userId: socket.data.userId,
      online: true,
    });
    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  async onLeave(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const { conversationId } = body ?? {};
    // Require actual room membership before broadcasting — otherwise any
    // authenticated socket could spoof offline-presence into arbitrary rooms
    // it knows the id of.
    if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) {
      return { ok: false };
    }
    await socket.leave(`conv:${conversationId}`);
    socket.to(`conv:${conversationId}`).emit('presence', {
      conversationId,
      userId: socket.data.userId,
      online: false,
    });
    return { ok: true };
  }

  @SubscribeMessage('typing:start')
  onTypingStart(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const { conversationId } = body ?? {};
    if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return { ok: false };
    socket.to(`conv:${conversationId}`).emit('typing', {
      conversationId,
      userId: socket.data.userId,
      typing: true,
    });
    return { ok: true };
  }

  @SubscribeMessage('typing:stop')
  onTypingStop(
    @ConnectedSocket() socket: AuthedSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const { conversationId } = body ?? {};
    if (!conversationId || !socket.rooms.has(`conv:${conversationId}`)) return { ok: false };
    socket.to(`conv:${conversationId}`).emit('typing', {
      conversationId,
      userId: socket.data.userId,
      typing: false,
    });
    return { ok: true };
  }

  // -------- server-side emitters (called from ChatService) -----------------

  emitNewMessage(conversationId: string, message: unknown, participantIds: string[]) {
    this.server.to(`conv:${conversationId}`).emit('message:new', message);
    // Also push to each participant's user room so conversation list badges
    // update even when the room isn't open.
    for (const uid of participantIds) {
      this.server.to(`user:${uid}`).emit('conversation:bump', { conversationId, message });
    }
  }

  emitReadUpdate(conversationId: string, userId: string, lastReadAt: string) {
    this.server.to(`conv:${conversationId}`).emit('read:update', {
      conversationId,
      userId,
      lastReadAt,
    });
  }
}
