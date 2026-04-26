import { z } from 'zod';

/**
 * T9.B — Public API for Enterprise.
 *
 * Coarse-grained scopes attached to each {@link ApiToken}. The guard
 * (`apps/api/src/api-tokens/api-token.guard.ts`) checks the
 * `requiredScope` declared by every `/v1/*` controller method against
 * this list before executing the handler.
 *
 * `read:*` scopes are read-only; `write:*` allow mutation. Adding a
 * scope here is a deliberate API surface decision — keep this list
 * small and forward-compatible.
 */
export const ApiTokenScopes = [
  'read:job-requests',
  'write:job-requests',
  'read:applications',
  'read:trainers',
  'read:contracts',
] as const;
export type ApiTokenScope = (typeof ApiTokenScopes)[number];

/** Per-token rate-limit ceiling. */
export const API_TOKEN_DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
export const API_TOKEN_MAX_RATE_LIMIT_PER_MINUTE = 600;

/** Hard cap on active (non-revoked) tokens per company. */
export const API_TOKEN_MAX_PER_COMPANY = 10;

/** Visible prefix on the public token (e.g. `tk_live_a1b2c3d4`). */
export const API_TOKEN_PREFIX_PUBLIC = 'tk_live_';

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z
    .array(z.enum(ApiTokenScopes))
    .min(1, { message: 'Pick at least one scope' })
    .max(ApiTokenScopes.length),
  /** Optional ISO-8601 expiry. Tokens without `expiresAt` never auto-expire. */
  expiresAt: z.string().datetime().nullable().optional(),
  rateLimitPerMinute: z
    .number()
    .int()
    .min(1)
    .max(API_TOKEN_MAX_RATE_LIMIT_PER_MINUTE)
    .optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;

export interface ApiTokenDto {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdByName: string | null;
  /** Bool for the UI: true while `revokedAt == null && (expiresAt == null || expiresAt > now)`. */
  active: boolean;
}

export interface CreatedApiTokenDto extends ApiTokenDto {
  /**
   * The full `prefix.secret` string — shown to the operator exactly
   * once at creation time. Subsequent reads return only the metadata
   * (without `token`).
   */
  token: string;
}
