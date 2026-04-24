import { Body, Controller, Get, HttpCode, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtService } from '@nestjs/jwt';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@trainova/shared';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, type AuthUser } from './current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Issues a short-lived (60s) JWT a browser client can present to the
   * Socket.IO gateway. The access token stays in an HttpOnly cookie and is
   * not readable from JS, so the client asks this endpoint for a scoped
   * ticket via the Next proxy (which adds the Bearer) and hands it to
   * `io({ auth: { token } })`. Ticket payload is `kind: 'ws'` so a leaked
   * ticket can't be replayed against the REST API.
   */
  @Post('ws-ticket')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async wsTicket(@CurrentUser() user: AuthUser) {
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role, kind: 'ws' },
      { expiresIn: '60s' },
    );
    return { token };
  }

  // Per-endpoint rate limits override the global 120/min default bucket.
  // Windows are 1 minute. Keys are per client IP (ThrottlerGuard default).

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(registerSchema))
  register(@Body() body: RegisterInput) {
    return this.auth.register(body);
  }

  @Post('login')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: LoginInput) {
    return this.auth.login(body);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @Post('verify-email')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(verifyEmailSchema))
  verifyEmail(@Body() body: VerifyEmailInput) {
    return this.auth.verifyEmail(body.token);
  }

  /**
   * Intentionally returns a neutral success so callers can't enumerate which
   * emails are registered or which accounts are already verified.
   */
  @Post('resend-verification')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(resendVerificationSchema))
  async resendVerification(@Body() body: ResendVerificationInput) {
    await this.auth.resendVerification(body.email, body.locale);
    return { ok: true };
  }

  /**
   * Always-200 response; never reveals whether the email exists.
   */
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(forgotPasswordSchema))
  async forgotPassword(@Body() body: ForgotPasswordInput) {
    await this.auth.forgotPassword(body.email, body.locale);
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(resetPasswordSchema))
  resetPassword(@Body() body: ResetPasswordInput) {
    return this.auth.resetPassword(body.token, body.password);
  }
}
