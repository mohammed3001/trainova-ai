import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmailProvider,
  Locale,
  ResetPasswordParams,
  SendEmailResult,
  TestAssignedParams,
  VerifyEmailParams,
  WelcomeParams,
} from './email.types';
import { ConsoleEmailProvider } from './providers/console.provider';
import { ResendEmailProvider } from './providers/resend.provider';
import {
  renderResetPassword,
  renderTestAssigned,
  renderVerifyEmail,
  renderWelcome,
} from './templates';

/**
 * High-level email service the rest of the app talks to.
 *
 * - Selects a provider at startup based on `EMAIL_PROVIDER`:
 *   - `resend` requires `RESEND_API_KEY` + `EMAIL_FROM`
 *   - anything else (default: `console`) logs the email instead of sending
 * - Holds the AR/EN template registry so consumers only deal with typed params.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private provider!: EmailProvider;
  private from!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.from = this.config.get<string>('EMAIL_FROM') ?? 'Trainova AI <no-reply@trainova.ai>';
    const choice = (this.config.get<string>('EMAIL_PROVIDER') ?? 'console').toLowerCase();
    const apiKey = this.config.get<string>('RESEND_API_KEY');

    if (choice === 'resend' && apiKey) {
      this.provider = new ResendEmailProvider(apiKey, this.from);
    } else {
      if (choice === 'resend' && !apiKey) {
        this.logger.warn(
          'EMAIL_PROVIDER=resend but RESEND_API_KEY is empty — falling back to console provider.',
        );
      }
      this.provider = new ConsoleEmailProvider();
    }
    this.logger.log(`Email provider: ${this.provider.name} (from: ${this.from})`);
  }

  get providerName(): 'resend' | 'console' {
    return this.provider.name;
  }

  async sendVerifyEmail(to: string, params: VerifyEmailParams): Promise<SendEmailResult> {
    const rendered = renderVerifyEmail(params);
    return this.provider.send({ to, ...rendered });
  }

  async sendResetPassword(to: string, params: ResetPasswordParams): Promise<SendEmailResult> {
    const rendered = renderResetPassword(params);
    return this.provider.send({ to, ...rendered });
  }

  async sendWelcome(to: string, params: WelcomeParams): Promise<SendEmailResult> {
    const rendered = renderWelcome(params);
    return this.provider.send({ to, ...rendered });
  }

  async sendTestAssigned(to: string, params: TestAssignedParams): Promise<SendEmailResult> {
    const rendered = renderTestAssigned(params);
    return this.provider.send({ to, ...rendered });
  }

  /**
   * Generic transactional/notification send. Derives a plaintext body by:
   *   1. replacing block-level tags with newlines so adjacent sentences
   *      don't run together,
   *   2. stripping the rest of the tags,
   *   3. decoding the five HTML entities that every template in this repo
   *      actually emits via escapeHtml — without this step, user-supplied
   *      titles round-trip as `&quot;Foo&quot;` in the plaintext fallback.
   */
  async sendRaw(to: string, subject: string, html: string): Promise<SendEmailResult> {
    const text = html
      .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return this.provider.send({ to, subject, html, text });
  }

  /**
   * Normalize an arbitrary locale string to one of the supported locales.
   * Defaults to `en` for unknown inputs so callers can pass raw user locale.
   */
  static normalizeLocale(input: string | null | undefined): Locale {
    if (input && input.toLowerCase().startsWith('ar')) return 'ar';
    return 'en';
  }
}
