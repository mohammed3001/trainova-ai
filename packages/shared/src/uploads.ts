import { z } from 'zod';

/**
 * Logical categories of uploads in the system. The storage bucket + visibility
 * rules + allowed MIME types + size budget are all derived from the kind on the
 * server side. Clients never choose their own object key.
 */
export const UPLOAD_KINDS = [
  'company-logo',
  'trainer-avatar',
  'trainer-asset',
  'application-attachment',
] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export type UploadVisibility = 'public' | 'private';

export interface UploadQuota {
  /** Maximum allowed byte length per file, enforced on presign and on commit. */
  maxFileSize: number;
  /** Maximum number of live (non-soft-deleted) rows per owner entity. */
  maxCount: number;
  /** Allow-list of MIME types (must match exactly, case-insensitive). */
  allowedMimes: readonly string[];
  /** Bucket visibility: public assets are served from CDN, private via signed GET. */
  visibility: UploadVisibility;
}

/**
 * Quotas per upload kind. These are the single source of truth shared between
 * client and server. Changes here must be reflected in the managed R2 bucket
 * policies.
 */
export const UPLOAD_QUOTAS = {
  'company-logo': {
    maxFileSize: 512 * 1024,
    maxCount: 1,
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'] as const,
    visibility: 'public',
  },
  'trainer-avatar': {
    maxFileSize: 512 * 1024,
    maxCount: 1,
    allowedMimes: ['image/png', 'image/jpeg', 'image/webp'] as const,
    visibility: 'public',
  },
  'trainer-asset': {
    maxFileSize: 5 * 1024 * 1024,
    maxCount: 10,
    allowedMimes: [
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ] as const,
    visibility: 'public',
  },
  'application-attachment': {
    maxFileSize: 10 * 1024 * 1024,
    maxCount: 5,
    allowedMimes: [
      'application/pdf',
      'application/zip',
      'text/plain',
      'image/png',
      'image/jpeg',
    ] as const,
    visibility: 'private',
  },
} as const satisfies Record<UploadKind, UploadQuota>;

const mimeTypeSchema = z
  .string()
  .min(3)
  .max(127)
  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i, 'Invalid MIME type');

export const uploadPresignRequestSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  /** ID of the entity the upload belongs to (companyId, applicationId, ...). */
  entityId: z.string().min(1).max(64),
  mimeType: mimeTypeSchema,
  byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  /** Optional for PR B1; used when filename is shown in UI (e.g. attachments). */
  fileName: z.string().max(200).optional(),
});
export type UploadPresignRequest = z.infer<typeof uploadPresignRequestSchema>;

export const uploadPresignResponseSchema = z.object({
  method: z.literal('PUT'),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()),
  objectKey: z.string().min(1),
  expiresAt: z.string().datetime(),
  /** Present for public-bucket uploads; used by client to optimistically render. */
  expectedPublicUrl: z.string().url().optional(),
  maxByteLength: z.number().int().positive(),
});
export type UploadPresignResponse = z.infer<typeof uploadPresignResponseSchema>;

export const uploadCommitRequestSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  entityId: z.string().min(1).max(64),
  objectKey: z.string().min(1).max(512),
  mimeType: mimeTypeSchema,
  byteLength: z.number().int().positive().max(64 * 1024 * 1024),
  title: z.string().max(200).optional(),
});
export type UploadCommitRequest = z.infer<typeof uploadCommitRequestSchema>;

export const uploadCommitResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(UPLOAD_KINDS),
  entityId: z.string(),
  objectKey: z.string(),
  url: z.string(),
  visibility: z.enum(['public', 'private']),
  scanStatus: z.enum(['pending', 'clean', 'infected']).optional(),
});
export type UploadCommitResponse = z.infer<typeof uploadCommitResponseSchema>;

export const uploadDeleteParamsSchema = z.object({
  kind: z.enum(UPLOAD_KINDS),
  entityId: z.string().min(1).max(64),
  assetId: z.string().min(1).max(64),
});
export type UploadDeleteParams = z.infer<typeof uploadDeleteParamsSchema>;

export function getUploadQuota(kind: UploadKind): UploadQuota {
  return UPLOAD_QUOTAS[kind];
}

export function isAllowedMime(kind: UploadKind, mime: string): boolean {
  const quota = UPLOAD_QUOTAS[kind];
  const lower = mime.toLowerCase();
  return (quota.allowedMimes as readonly string[]).includes(lower);
}
