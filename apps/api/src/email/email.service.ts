import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EMAIL_TEMPLATE_SPECS,
  interpolateEmailTemplate,
  type EmailTemplateKey,
} from '@trainova/shared';
import { PrismaService } from '../prisma/prisma.service';
import type {
  EmailProvider,
  Locale,
  RenderedEmail,
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
import { renderLayout } from './templates/layout';

/**
 * High-level email service the rest of the app talks to.
 *
 * - Selects a provider at startup based on `EMAIL_PROVIDER`:
 *   - `resend` requires `RESEND_API_KEY` + `EMAIL_FROM`
 *   - anything else (default: `console`) logs the email instead of sending
 * - Holds the AR/EN template registry so consumers only deal with typed params.
 * - On each send, first looks up an admin-edited `EmailTemplate` row for the
 *   `(key, locale)` pair. If present, enabled, and all required variables
 *   are resolved against the typed params, the DB copy wins — otherwise we
 *   fall back to the built-in template so an email never ships half-rendered.
 */
@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private provider!: EmailProvider;
  private from!: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

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
    const rendered = await this.renderWithOverride(
      'VERIFY_EMAIL',
      params.locale,
      {
        name: params.name,
        verifyUrl: params.verifyUrl,
      },
      () => renderVerifyEmail(params),
    );
    return this.provider.send({ to, ...rendered });
  }

  async sendResetPassword(to: string, params: ResetPasswordParams): Promise<SendEmailResult> {
    const rendered = await this.renderWithOverride(
      'RESET_PASSWORD',
      params.locale,
      {
        name: params.name,
        resetUrl: params.resetUrl,
      },
      () => renderResetPassword(params),
    );
    return this.provider.send({ to, ...rendered });
  }

  async sendWelcome(to: string, params: WelcomeParams): Promise<SendEmailResult> {
    const rendered = await this.renderWithOverride(
      'WELCOME',
      params.locale,
      { name: params.name, dashboardUrl: params.dashboardUrl },
      () => renderWelcome(params),
    );
    return this.provider.send({ to, ...rendered });
  }

  async sendTestAssigned(to: string, params: TestAssignedParams): Promise<SendEmailResult> {
    const rendered = await this.renderWithOverride(
      'TEST_ASSIGNED',
      params.locale,
      {
        trainerName: params.name,
        testTitle: params.testTitle,
        companyName: params.companyName,
        startUrl: params.takeUrl,
      },
      () => renderTestAssigned(params),
    );
    return this.provider.send({ to, ...rendered });
  }

  /**
   * Normalize an arbitrary locale string to one of the supported locales.
   * Defaults to `en` for unknown inputs so callers can pass raw user locale.
   */
  static normalizeLocale(input: string | null | undefined): Locale {
    if (input && input.toLowerCase().startsWith('ar')) return 'ar';
    return 'en';
  }

  /**
   * Try to render from a DB override; fall back to the in-code template if
   * the row is missing, disabled, or is missing a required variable.
   */
  private async renderWithOverride(
    key: EmailTemplateKey,
    locale: Locale,
    vars: Record<string, string>,
    fallback: () => RenderedEmail,
  ): Promise<RenderedEmail> {
    try {
      const row = await this.prisma.emailTemplate.findUnique({
        where: { key_locale: { key, locale } },
      });
      if (!row || !row.enabled) return fallback();

      const spec = EMAIL_TEMPLATE_SPECS[key];
      for (const required of spec.requiredVariables) {
        if (vars[required] == null) {
          this.logger.warn(
            `EmailTemplate ${key}/${locale} missing required variable "${required}" at send-time — using built-in template.`,
          );
          return fallback();
        }
      }

      const subject = interpolateEmailTemplate(row.subject, vars, { escapeHtml: false });
      const innerHtml = interpolateEmailTemplate(row.bodyHtml, vars, { escapeHtml: true });
      const text = interpolateEmailTemplate(row.bodyText, vars, { escapeHtml: false });
      return { subject, html: renderLayout(locale, innerHtml), text };
    } catch (err) {
      this.logger.error(
        `Failed to load EmailTemplate ${key}/${locale}, falling back to built-in: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return fallback();
    }
  }
}
