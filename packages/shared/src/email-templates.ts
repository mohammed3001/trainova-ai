import { z } from 'zod';
import { Locales } from './enums';

/**
 * Registry of all email templates the platform can send. Each key maps to
 * a specific transactional flow and defines the variables the template
 * author can interpolate with `{{variableName}}`. Adding a new flow means:
 *   1. Add the key here with its variables & description
 *   2. Wire the call-site in `EmailService` to pass those variables
 *   3. Seed default EN/AR copy via migration or admin UI
 */
export const EMAIL_TEMPLATE_KEYS = [
  'VERIFY_EMAIL',
  'RESET_PASSWORD',
  'WELCOME',
  'TEST_ASSIGNED',
  'APPLICATION_STATUS_CHANGED',
  'TEST_GRADED',
  'CONTRACT_SIGNED',
  'PAYOUT_COMPLETED',
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export type EmailTemplateLocale = (typeof Locales)[number];

/**
 * Declares what variables a template supports. The admin UI renders these
 * as a reference panel so the editor knows what `{{…}}` names are safe to
 * use. The `required` list is enforced at send-time: if the call-site doesn't
 * provide one, the service refuses to interpolate and falls back to the
 * built-in template so no half-rendered email ships.
 */
export interface EmailTemplateSpec {
  key: EmailTemplateKey;
  description: string;
  requiredVariables: readonly string[];
  optionalVariables: readonly string[];
}

export const EMAIL_TEMPLATE_SPECS: Record<EmailTemplateKey, EmailTemplateSpec> = {
  VERIFY_EMAIL: {
    key: 'VERIFY_EMAIL',
    description: 'Sent after signup to confirm the user owns the email address.',
    requiredVariables: ['name', 'verifyUrl'],
    optionalVariables: ['expiresInHours'],
  },
  RESET_PASSWORD: {
    key: 'RESET_PASSWORD',
    description: 'Sent when the user requests a password reset.',
    requiredVariables: ['name', 'resetUrl'],
    optionalVariables: ['expiresInMinutes'],
  },
  WELCOME: {
    key: 'WELCOME',
    description: 'Sent after the user verifies their email.',
    requiredVariables: ['name'],
    optionalVariables: ['dashboardUrl'],
  },
  TEST_ASSIGNED: {
    key: 'TEST_ASSIGNED',
    description: 'Sent when a company assigns an evaluation to a trainer.',
    requiredVariables: ['trainerName', 'testTitle', 'companyName', 'startUrl'],
    optionalVariables: ['timeLimitMin'],
  },
  APPLICATION_STATUS_CHANGED: {
    key: 'APPLICATION_STATUS_CHANGED',
    description: 'Sent when a company updates the trainer application status.',
    requiredVariables: ['trainerName', 'status', 'requestTitle', 'applicationUrl'],
    optionalVariables: ['companyName', 'reviewerNotes'],
  },
  TEST_GRADED: {
    key: 'TEST_GRADED',
    description: 'Sent when a company posts the final grade for a trainer attempt.',
    requiredVariables: ['trainerName', 'testTitle', 'score', 'maxScore', 'resultUrl'],
    optionalVariables: ['companyName'],
  },
  CONTRACT_SIGNED: {
    key: 'CONTRACT_SIGNED',
    description: 'Sent to both parties after both have e-signed a contract.',
    requiredVariables: ['recipientName', 'contractTitle', 'contractUrl'],
    optionalVariables: ['counterpartyName'],
  },
  PAYOUT_COMPLETED: {
    key: 'PAYOUT_COMPLETED',
    description: 'Sent to a trainer when a payout has been released from escrow.',
    requiredVariables: ['trainerName', 'amount', 'currency'],
    optionalVariables: ['reference', 'payoutUrl'],
  },
};

export const EmailTemplateKeySchema = z.enum(EMAIL_TEMPLATE_KEYS);
export const EmailTemplateLocaleSchema = z.enum(Locales);

export const EmailTemplateIdParamSchema = z.object({
  id: z.string().min(1),
});

export const ListEmailTemplatesQuerySchema = z.object({
  key: EmailTemplateKeySchema.optional(),
  locale: EmailTemplateLocaleSchema.optional(),
  enabled: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => (v == null ? undefined : v === 'true')),
  q: z.string().trim().max(200).optional(),
});
export type ListEmailTemplatesQuery = z.infer<typeof ListEmailTemplatesQuerySchema>;

export const CreateEmailTemplateSchema = z.object({
  key: EmailTemplateKeySchema,
  locale: EmailTemplateLocaleSchema,
  subject: z.string().trim().min(1).max(300),
  bodyHtml: z.string().trim().min(1).max(100_000),
  bodyText: z.string().trim().min(1).max(100_000),
  enabled: z.boolean().optional().default(true),
  description: z.string().trim().max(1000).nullish(),
});
export type CreateEmailTemplateInput = z.infer<typeof CreateEmailTemplateSchema>;

export const UpdateEmailTemplateSchema = z
  .object({
    subject: z.string().trim().min(1).max(300),
    bodyHtml: z.string().trim().min(1).max(100_000),
    bodyText: z.string().trim().min(1).max(100_000),
    enabled: z.boolean(),
    description: z.string().trim().max(1000).nullish(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateEmailTemplateInput = z.infer<typeof UpdateEmailTemplateSchema>;

export const PreviewEmailTemplateSchema = z.object({
  subject: z.string().min(1).max(300),
  bodyHtml: z.string().min(1).max(100_000),
  bodyText: z.string().min(1).max(100_000),
  variables: z.record(z.string(), z.string()).optional(),
});
export type PreviewEmailTemplateInput = z.infer<typeof PreviewEmailTemplateSchema>;

/**
 * Escapes a literal string for safe substitution inside HTML. The service
 * runs this on every interpolated value before replacing `{{name}}`, so
 * trainer-submitted names like `O'Brien <script>` never reach the inbox.
 */
export function escapeHtmlForTemplate(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Interpolates `{{var}}` tokens in a template string with values from `vars`.
 * - Whitespace inside `{{ ... }}` is tolerated.
 * - Missing vars leave the token untouched so the admin can see what's missing
 *   in the preview instead of shipping an empty field.
 * - `escapeHtml` controls whether values are HTML-escaped (true for bodyHtml/
 *   subject, false for bodyText).
 */
export function interpolateEmailTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
  options: { escapeHtml: boolean },
): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_match, name: string) => {
    const raw = vars[name];
    if (raw == null) return `{{${name}}}`;
    const str = String(raw);
    return options.escapeHtml ? escapeHtmlForTemplate(str) : str;
  });
}
