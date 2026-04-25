import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../common/password.util';
import { slugify, randomSuffix } from '../common/slug.util';
import { hashToken, issueOpaqueToken } from '../common/token.util';
import { EmailService } from '../email/email.service';
import type { RegisterInput, LoginInput } from '@trainova/shared';

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30m
const RESET_TOKEN_TTL_MIN = 30;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
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

    // Kick off verification email (fire-and-forget; never blocks registration).
    void this.issueVerificationEmail(user.id, user.email, user.name, user.locale).catch((err) => {
      this.logger.error(`post-register verification email failed: ${(err as Error).message}`);
    });

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

  // ---------------------------------------------------------------------------
  // Email verification
  // ---------------------------------------------------------------------------

  /**
   * Public endpoint. Always returns a neutral success so we never leak which
   * emails exist. If the account exists and is unverified, a fresh token is
   * issued and the old unconsumed ones for that user are invalidated.
   */
  async resendVerification(email: string, locale: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // silent
    if (user.emailVerifiedAt) return; // already verified
    // Swallow email-provider errors so the response stays neutral (no user enumeration).
    try {
      await this.issueVerificationEmail(user.id, user.email, user.name, locale || user.locale);
    } catch (err) {
      this.logger.error(`resend-verification email failed: ${(err as Error).message}`);
    }
  }

  /**
   * Confirms an opaque verify token. Single-use: the row is marked consumed
   * on success so the same link cannot be replayed.
   */
  async verifyEmail(rawToken: string): Promise<{ verified: true }> {
    const tokenHash = hashToken(rawToken);
    const row = await this.prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
    if (!row) throw new BadRequestException('Invalid or expired token');
    if (row.consumedAt) throw new BadRequestException('Invalid or expired token');
    if (row.expiresAt.getTime() < Date.now()) throw new BadRequestException('Invalid or expired token');

    // Interactive transaction so the consume check and the user update share
    // the same DB transaction and row lock. The conditional `updateMany` with
    // `consumedAt: null` + `expiresAt: { gt: now }` atomically claims the
    // token: at most one concurrent caller will get `count === 1`; any other
    // caller sees 0 and bails with the same neutral error.
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.emailVerificationToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Invalid or expired token');
      }
      await tx.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: new Date() },
      });
      // Invalidate any other unconsumed verify tokens for this user.
      await tx.emailVerificationToken.updateMany({
        where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
        data: { consumedAt: new Date() },
      });
    });

    return { verified: true };
  }

  async issueVerificationEmail(
    userId: string,
    email: string,
    name: string,
    locale: string,
  ): Promise<void> {
    // Invalidate any previous unconsumed tokens for this user so only the
    // newest link works.
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const { raw, hash } = issueOpaqueToken(32);
    const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_MS);
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash: hash, expiresAt },
    });

    const normalizedLocale = EmailService.normalizeLocale(locale);
    const verifyUrl = this.buildAppUrl(
      `/${normalizedLocale}/verify-email?token=${encodeURIComponent(raw)}`,
    );
    await this.email.sendVerifyEmail(email, {
      locale: normalizedLocale,
      name,
      verifyUrl,
    });
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  /**
   * Internal — issue a single-use 30-min reset token for `userId` and send the
   * reset email. Errors propagate so callers (admin triggerPasswordReset) can
   * observe real failures. The public `forgotPassword` wraps this in a
   * swallowing try/catch so the external endpoint stays enumeration-safe.
   */
  async issuePasswordResetEmail(userId: string, locale: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const { raw, hash } = issueOpaqueToken(32);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });

    const normalizedLocale = EmailService.normalizeLocale(locale || user.locale);
    const resetUrl = this.buildAppUrl(
      `/${normalizedLocale}/reset-password?token=${encodeURIComponent(raw)}`,
    );
    await this.email.sendResetPassword(user.email, {
      locale: normalizedLocale,
      name: user.name,
      resetUrl,
      expiresInMinutes: RESET_TOKEN_TTL_MIN,
    });
  }

  /**
   * Public endpoint. Always returns success regardless of whether the email
   * matches a real user (no user-enumeration). If the user exists, a
   * single-use 30-min token is issued and the reset email sent. All
   * token-issuance / email-provider errors are swallowed so the response
   * stays neutral (no user enumeration via 200 vs 500 differential).
   */
  async forgotPassword(email: string, locale: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    if (user.status !== 'ACTIVE') return;
    try {
      await this.issuePasswordResetEmail(user.id, locale);
    } catch (err) {
      this.logger.error(`forgot-password email failed: ${(err as Error).message}`);
    }
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<{ reset: true }> {
    const tokenHash = hashToken(rawToken);
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!row) throw new BadRequestException('Invalid or expired token');
    if (row.consumedAt) throw new BadRequestException('Invalid or expired token');
    if (row.expiresAt.getTime() < Date.now()) throw new BadRequestException('Invalid or expired token');

    // scrypt is intentionally slow (~50–200ms). We compute the new hash before
    // opening the transaction so DB work stays short, then claim the token
    // atomically inside the transaction below. Only the caller whose
    // conditional `updateMany` returns count===1 wins; concurrent duplicates
    // see count===0 and raise the same neutral error.
    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Invalid or expired token');
      }
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      // Invalidate any other outstanding reset tokens for this user.
      await tx.passwordResetToken.updateMany({
        where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
        data: { consumedAt: new Date() },
      });
      // Revoke any active refresh sessions so other devices get logged out.
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { reset: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private buildAppUrl(path: string): string {
    const base =
      this.config.get<string>('NEXT_PUBLIC_SITE_URL') ??
      this.config.get<string>('APP_URL') ??
      'http://localhost:3000';
    return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
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
