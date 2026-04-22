import { Injectable, Logger } from '@nestjs/common';
import type { EmailProvider, SendEmailInput, SendEmailResult } from '../email.types';

@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console' as const;
  private readonly logger = new Logger('Email.Console');

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const id = `console_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    this.logger.log(
      `\n— Email (console provider) —` +
        `\n  id:      ${id}` +
        `\n  to:      ${input.to}` +
        `\n  subject: ${input.subject}` +
        `\n  text:\n${input.text.split('\n').map((l) => '    ' + l).join('\n')}\n`,
    );
    return { id, provider: 'console' };
  }
}
