import { z } from 'zod';

/**
 * Dynamic application form — a schema that companies compose per JobRequest.
 *
 * Shared between:
 *   - Company builder UI (company/requests/new)
 *   - Backend validation on JobRequest create/update + Application create
 *   - Trainer render UI (requests/[slug]/apply-form)
 *
 * Versioned so we can migrate shape later without breaking stored rows.
 */

export const APPLICATION_FORM_SCHEMA_VERSION = 1 as const;

export const FIELD_KINDS = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'number',
  'date',
  'url',
  'email',
  'boolean',
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

const nonEmpty = z.string().trim().min(1).max(200);
const helpText = z.string().trim().max(500).optional();

const baseFieldShape = {
  id: z.string().min(1).max(64),
  labelEn: nonEmpty,
  labelAr: nonEmpty,
  helpEn: helpText,
  helpAr: helpText,
  required: z.boolean().default(false),
  order: z.number().int().nonnegative(),
};

export const formFieldSchema = z
  .object({
    ...baseFieldShape,
    kind: z.enum(FIELD_KINDS),
    options: z
      .array(
        z.object({
          value: z.string().min(1).max(80),
          labelEn: nonEmpty,
          labelAr: nonEmpty,
        }),
      )
      .max(20)
      .optional(),
    minLength: z.number().int().nonnegative().max(10000).optional(),
    maxLength: z.number().int().nonnegative().max(10000).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .superRefine((field, ctx) => {
    if (field.kind === 'single_select' || field.kind === 'multi_select') {
      if (!field.options || field.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['options'],
          message: 'Select fields need at least 2 options',
        });
      } else {
        const values = field.options.map((o) => o.value);
        if (new Set(values).size !== values.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: 'Option values must be unique',
          });
        }
      }
    }
    if (
      field.minLength !== undefined &&
      field.maxLength !== undefined &&
      field.minLength > field.maxLength
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minLength'],
        message: 'minLength cannot exceed maxLength',
      });
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['min'],
        message: 'min cannot exceed max',
      });
    }
  });

export type FormField = z.infer<typeof formFieldSchema>;

export const applicationFormSchema = z
  .object({
    version: z.literal(APPLICATION_FORM_SCHEMA_VERSION),
    fields: z.array(formFieldSchema).max(30),
  })
  .superRefine((form, ctx) => {
    const ids = form.fields.map((f) => f.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fields'],
        message: 'Field ids must be unique',
      });
    }
  });

export type ApplicationForm = z.infer<typeof applicationFormSchema>;

export type AnswerValue = string | number | boolean | string[];
export type AnswerMap = Record<string, AnswerValue>;

/**
 * Runtime validator for a set of answers against a schema. Returns either a
 * coerced/normalized `answers` map or an array of per-field error messages
 * keyed by fieldId. Kept separate from Zod so we can preserve partial answers
 * for a friendlier re-render on the client.
 */
export function validateAnswers(
  schema: ApplicationForm | null | undefined,
  rawAnswers: unknown,
): { ok: true; answers: AnswerMap } | { ok: false; errors: Record<string, string> } {
  if (!schema || schema.fields.length === 0) return { ok: true, answers: {} };

  const errors: Record<string, string> = {};
  const out: AnswerMap = {};
  const answers =
    rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
      ? (rawAnswers as Record<string, unknown>)
      : {};

  for (const field of schema.fields) {
    const raw = answers[field.id];
    const missing = raw === undefined || raw === null || raw === '';
    if (missing) {
      if (field.required) errors[field.id] = 'Required';
      continue;
    }

    switch (field.kind) {
      case 'short_text':
      case 'long_text':
      case 'url':
      case 'email': {
        if (typeof raw !== 'string') {
          errors[field.id] = 'Must be text';
          break;
        }
        const str = raw.trim();
        if (field.minLength !== undefined && str.length < field.minLength) {
          errors[field.id] = `Must be at least ${field.minLength} characters`;
          break;
        }
        if (field.maxLength !== undefined && str.length > field.maxLength) {
          errors[field.id] = `Must be at most ${field.maxLength} characters`;
          break;
        }
        if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
          errors[field.id] = 'Invalid email';
          break;
        }
        if (field.kind === 'url') {
          try {
            const parsed = new URL(str);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
              errors[field.id] = 'Only http and https URLs are allowed';
              break;
            }
          } catch {
            errors[field.id] = 'Invalid URL';
            break;
          }
        }
        out[field.id] = str;
        break;
      }
      case 'number': {
        const n = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(n)) {
          errors[field.id] = 'Must be a number';
          break;
        }
        if (field.min !== undefined && n < field.min) {
          errors[field.id] = `Must be at least ${field.min}`;
          break;
        }
        if (field.max !== undefined && n > field.max) {
          errors[field.id] = `Must be at most ${field.max}`;
          break;
        }
        out[field.id] = n;
        break;
      }
      case 'date': {
        if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
          errors[field.id] = 'Invalid date';
          break;
        }
        out[field.id] = raw;
        break;
      }
      case 'boolean': {
        if (typeof raw !== 'boolean') {
          errors[field.id] = 'Must be true or false';
          break;
        }
        out[field.id] = raw;
        break;
      }
      case 'single_select': {
        const opt = (field.options ?? []).find((o) => o.value === raw);
        if (!opt) {
          errors[field.id] = 'Invalid choice';
          break;
        }
        out[field.id] = opt.value;
        break;
      }
      case 'multi_select': {
        const arr = Array.isArray(raw) ? raw : [];
        const allowed = new Set((field.options ?? []).map((o) => o.value));
        const valid = arr.filter((v): v is string => typeof v === 'string' && allowed.has(v));
        if (valid.length === 0) {
          if (field.required) errors[field.id] = 'Pick at least one option';
          else out[field.id] = [];
          break;
        }
        out[field.id] = valid;
        break;
      }
      default: {
        // Exhaustiveness: should never hit because Zod narrows `kind`.
        errors[field.id] = 'Unsupported field';
      }
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, answers: out };
}
