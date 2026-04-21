import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/password.util';
import { slugify, randomSuffix } from '../common/slug.util';
import type { RegisterInput, LoginInput } from '@trainova/shared';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await hashPassword(input.password);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        passwordHash,
        role: input.role,
        locale: input.locale ?? 'en',
      },
    });

    if (input.role === 'COMPANY_OWNER') {
      const slug = await this.uniqueCompanySlug(input.name);
      await this.prisma.company.create({
        data: {
          ownerId: user.id,
          name: input.name,
          slug,
        },
      });
    } else if (input.role === 'TRAINER') {
      const slug = await this.uniqueTrainerSlug(input.name);
      await this.prisma.trainerProfile.create({
        data: {
          userId: user.id,
          slug,
          headline: 'AI Trainer',
        },
      });
    }

    return this.issueTokens(user.id, user.email, user.role);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account not active');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.issueTokens(user.id, user.email, user.role);
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        company: { select: { id: true, slug: true, name: true, verified: true } },
        trainerProfile: { select: { id: true, slug: true, verified: true, headline: true } },
      },
    });
  }

  private async issueTokens(id: string, email: string, role: string) {
    const payload = { sub: id, email, role };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken, user: { id, email, role } };
  }

  private async uniqueCompanySlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const hit = await this.prisma.company.findUnique({ where: { slug } });
      if (!hit) return slug;
      slug = `${base}-${randomSuffix(4)}`;
    }
    return `${base}-${Date.now()}`;
  }

  private async uniqueTrainerSlug(name: string): Promise<string> {
    const base = slugify(name);
    let slug = base;
    for (let i = 0; i < 5; i++) {
      const hit = await this.prisma.trainerProfile.findUnique({ where: { slug } });
      if (!hit) return slug;
      slug = `${base}-${randomSuffix(4)}`;
    }
    return `${base}-${Date.now()}`;
  }
}
