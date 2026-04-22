import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { EmailProvider, SendEmailInput, SendEmailResult } from '../email.types';

/**
 * Resend transactional email provider.
 *
 * Requires:
 *   - RESEND_API_KEY
 *   - EMAIL_FROM (e.g. `Trainova AI <no-reply@trainova.ai>`; domain must be
 *     verified in the Resend dashboard with SPF + DKIM records).
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend' as const;
  private readonly logger = new Logger('Email.Resend');
  private readonly client: Resend;
  private readonly from: string;

  constructor(apiKey: string, from: string) {
    this.client = new Resend(apiKey);
    this.from = from;
  }

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      replyTo: input.replyTo,
    });
    if (error) {
      this.logger.error(`Resend send failed: ${error.name} — ${error.message}`);
      throw new Error(`Resend send failed: ${error.message}`);
    }
    const id = data?.id ?? 'unknown';
    this.logger.log(`sent to=${input.to} id=${id}`);
    return { id, provider: 'resend' };
  }
}
