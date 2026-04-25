import { z } from 'zod';

/**
 * Topics surfaced on the public /contact page. Mirrors the
 * ContactSubmissionTopic enum in the Prisma schema.
 */
export const CONTACT_TOPICS = [
  'GENERAL',
  'SALES',
  'SUPPORT',
  'PRESS',
  'PARTNERSHIP',
  'ADVERTISING',
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  topic: z.enum(CONTACT_TOPICS).default('GENERAL'),
  company: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  message: z.string().trim().min(20).max(4000),
  /// Honeypot — bots tend to fill every field. We accept any string here
  /// (bounded so it can't be abused as a vector) and the controller drops
  /// the request silently when it is non-empty. Returning a validation
  /// error would tell bots the field is monitored.
  website: z.string().max(500).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});

export type ContactSubmissionInput = z.input<typeof contactSubmissionSchema>;
export type ContactSubmissionParsed = z.output<typeof contactSubmissionSchema>;

export const contactSubmissionResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string(),
});

export type ContactSubmissionResponse = z.infer<
  typeof contactSubmissionResponseSchema
>;

/**
 * Schema for the advertise enquiry form. We reuse the contact-submission
 * pipeline (same DB table, topic = ADVERTISING) but expose extra fields
 * so the marketing page can carry the chosen package and budget.
 */
export const advertiseEnquirySchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().min(2).max(160),
  packageId: z
    .enum(['FEATURED_COMPANY', 'SPONSORED_TRAINER', 'CATEGORY_SPONSOR', 'NEWSLETTER', 'CUSTOM'])
    .default('CUSTOM'),
  budgetUsd: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'number' ? v : Number(v)))
    .pipe(z.number().int().nonnegative().max(10_000_000))
    .optional(),
  message: z.string().trim().min(20).max(4000),
  /// Honeypot — see contactSubmissionSchema.website above.
  website: z.string().max(500).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});

export type AdvertiseEnquiryInput = z.input<typeof advertiseEnquirySchema>;
export type AdvertiseEnquiryParsed = z.output<typeof advertiseEnquirySchema>;
