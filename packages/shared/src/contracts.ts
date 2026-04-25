/**
 * T7.C — E-Signature: shared schemas and helpers.
 *
 * `ContractTemplate`: reusable Markdown body authored by Admins. Variables
 * are declared explicitly so the generator can substitute them per Contract
 * (e.g. `companyName`, `trainerName`, `total`, `currency`).
 *
 * `ContractDocument`: a frozen instance generated from a template (or
 * authored ad-hoc) for a specific Contract. `bodyHash` is sha-256 over the
 * exact Markdown body so any later mutation of `bodyMarkdown` is detectable
 * after at least one signature is recorded.
 *
 * `ContractSignature`: one row per signer per document. Both COMPANY and
 * TRAINER must sign before the document transitions to `FULLY_SIGNED`. The
 * signing payload captures `signedName`, `intent`, IP and User-Agent so the
 * audit trail survives subsequent edits to the user record.
 */
import { z } from 'zod';

export const CONTRACT_DOCUMENT_KINDS = ['NDA', 'MSA', 'SOW', 'CUSTOM'] as const;
export const CONTRACT_TEMPLATE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const CONTRACT_DOCUMENT_STATUSES = [
  'DRAFT',
  'AWAITING_SIGNATURES',
  'PARTIALLY_SIGNED',
  'FULLY_SIGNED',
  'CANCELLED',
  'EXPIRED',
] as const;
export const SIGNATURE_ROLES = ['COMPANY', 'TRAINER'] as const;
export const SIGNATURE_STATUSES = ['PENDING', 'SIGNED', 'DECLINED'] as const;

export type ContractDocumentKind = (typeof CONTRACT_DOCUMENT_KINDS)[number];
export type ContractTemplateStatus = (typeof CONTRACT_TEMPLATE_STATUSES)[number];
export type ContractDocumentStatus = (typeof CONTRACT_DOCUMENT_STATUSES)[number];
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];
export type SignatureStatus = (typeof SIGNATURE_STATUSES)[number];

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const templateVariableSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'must be alphanumeric, start with letter'),
  label: z.string().trim().min(1).max(120),
  required: z.boolean().default(false),
  defaultValue: z.string().max(500).optional(),
});
export type TemplateVariableInput = z.input<typeof templateVariableSchema>;
export type TemplateVariable = z.output<typeof templateVariableSchema>;

export const createContractTemplateInputSchema = z.object({
  kind: z.enum(CONTRACT_DOCUMENT_KINDS),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(80)
    .regex(slugRegex, 'must be kebab-case (lowercase letters, digits, dashes)'),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional(),
  bodyMarkdown: z.string().trim().min(20).max(50_000),
  locale: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .default('EN')
    .transform((s) => s.toUpperCase()),
  variables: z.array(templateVariableSchema).max(64).default([]),
  status: z.enum(CONTRACT_TEMPLATE_STATUSES).default('DRAFT'),
});
export type CreateContractTemplateInput = z.input<typeof createContractTemplateInputSchema>;
export type CreateContractTemplateParsed = z.output<typeof createContractTemplateInputSchema>;

export const updateContractTemplateInputSchema = createContractTemplateInputSchema
  .partial()
  .extend({
    status: z.enum(CONTRACT_TEMPLATE_STATUSES).optional(),
  });
export type UpdateContractTemplateInput = z.input<typeof updateContractTemplateInputSchema>;

export const generateContractDocumentInputSchema = z.object({
  contractId: z.string().min(1).max(64),
  templateId: z.string().min(1).max(64).optional(),
  kind: z.enum(CONTRACT_DOCUMENT_KINDS),
  title: z.string().trim().min(2).max(200),
  bodyMarkdown: z.string().trim().min(20).max(50_000).optional(),
  variables: z.record(z.string(), z.string().max(2000)).optional(),
  expiresAt: z
    .union([z.string().datetime(), z.date()])
    .optional()
    .transform((v) => (typeof v === 'string' ? new Date(v) : v)),
});
export type GenerateContractDocumentInput = z.input<typeof generateContractDocumentInputSchema>;
export type GenerateContractDocumentParsed = z.output<
  typeof generateContractDocumentInputSchema
>;

export const signContractDocumentInputSchema = z.object({
  signedName: z.string().trim().min(2).max(160),
  intent: z.string().trim().min(10).max(2000),
});
export type SignContractDocumentInput = z.input<typeof signContractDocumentInputSchema>;

export const declineContractDocumentInputSchema = z.object({
  // Reason is optional. When omitted or blank, no reason is shared with the
  // counter-party; the decline still cancels the document.
  reason: z.string().trim().max(2000).optional().default(''),
});
export type DeclineContractDocumentInput = z.input<
  typeof declineContractDocumentInputSchema
>;

export const listTemplatesQuerySchema = z.object({
  kind: z.enum(CONTRACT_DOCUMENT_KINDS).optional(),
  status: z.enum(CONTRACT_TEMPLATE_STATUSES).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});
export type ListTemplatesQuery = z.input<typeof listTemplatesQuerySchema>;

/**
 * Render a template body with the provided variable map. The template
 * uses `{{key}}` syntax. Missing required keys raise a `RenderError`.
 * Unknown keys in the input map are ignored (caller fault, harmless).
 */
export class TemplateRenderError extends Error {
  constructor(
    message: string,
    public readonly missing: string[],
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

export function renderTemplate(
  body: string,
  variables: ReadonlyArray<TemplateVariable>,
  values: Readonly<Record<string, string | undefined>>,
): string {
  const missing: string[] = [];
  const lookup = new Map<string, TemplateVariable>();
  for (const v of variables) lookup.set(v.key, v);
  const out = body.replace(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g, (_, key: string) => {
    const supplied = values[key];
    if (supplied !== undefined && supplied !== null && supplied !== '') {
      return supplied;
    }
    const declared = lookup.get(key);
    if (declared?.defaultValue !== undefined) return declared.defaultValue;
    if (declared?.required) {
      missing.push(key);
      return `{{${key}}}`;
    }
    // Unknown / optional-without-default: leave a visible placeholder so
    // the human author can spot it before signing.
    return `{{${key}}}`;
  });
  if (missing.length > 0) {
    throw new TemplateRenderError(
      `Missing required template variables: ${missing.join(', ')}`,
      missing,
    );
  }
  return out;
}
