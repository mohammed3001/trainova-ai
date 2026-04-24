import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  kind?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    });
  }

  async validate(payload: JwtPayload) {
    // ws-scoped tickets are only valid for the Socket.IO handshake; they must
    // NEVER authenticate a REST call. Reject them here so a leaked ticket
    // cannot be replayed against /api/... Bearer endpoints.
    if (payload.kind === 'ws') throw new UnauthorizedException('Invalid token scope');
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account not active');
    }
    if (user.role !== payload.role) {
      throw new UnauthorizedException('Role changed; please re-authenticate');
    }
    return { id: user.id, email: user.email, role: user.role };
  }
}
