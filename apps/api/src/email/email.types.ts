export type Locale = 'en' | 'ar';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  provider: 'resend' | 'console';
}

export interface EmailProvider {
  readonly name: 'resend' | 'console';
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export interface VerifyEmailParams {
  locale: Locale;
  name: string;
  verifyUrl: string;
}

export interface ResetPasswordParams {
  locale: Locale;
  name: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export interface WelcomeParams {
  locale: Locale;
  name: string;
  dashboardUrl: string;
}

export interface TestAssignedParams {
  locale: Locale;
  name: string;
  companyName: string;
  testTitle: string;
  takeUrl: string;
  timeLimitMin?: number | null;
}
