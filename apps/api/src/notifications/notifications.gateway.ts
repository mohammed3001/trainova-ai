import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

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
 * Socket.IO namespace for live notification delivery. Clients connect to
 * `/ws/notifications` with the same short-lived ticket used for chat
 * (`kind: 'ws'`). Each authenticated socket joins `user:<id>` so the
 * `NotificationsService` can broadcast by userId.
 */
@WebSocketGateway({
  path: '/ws/notifications',
  cors: { origin: true, credentials: true },
  transports: ['websocket', 'polling'],
})
export class NotificationsGateway
  implements OnModuleInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);
  private pub?: Redis;
  private sub?: Redis;

  constructor(private readonly jwt: JwtService) {}

  async onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.log('REDIS_URL not set — notifications gateway in single-instance mode');
      return;
    }
    try {
      this.pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
      this.sub = this.pub.duplicate();
      await Promise.all([this.pub.connect(), this.sub.connect()]);
      this.server.adapter(createAdapter(this.pub, this.sub));
      this.logger.log('Notifications gateway Redis adapter attached');
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
      if (payload.kind && payload.kind !== 'ws') {
        socket.disconnect(true);
        return;
      }
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.join(`user:${payload.sub}`);
    } catch {
      socket.disconnect(true);
    }
  }

  handleDisconnect(_socket: Socket) {
    // no-op
  }

  pushToUser(
    userId: string,
    payload: {
      id: string;
      type: string;
      payload: unknown;
      readAt: string | null;
      createdAt: string;
    },
  ) {
    this.server.to(`user:${userId}`).emit('notification:new', payload);
  }
}
