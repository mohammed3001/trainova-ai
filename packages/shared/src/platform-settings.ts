import { z } from 'zod';

/**
 * T5.C.3 — Typed platform settings.
 *
 * The DB `Setting` table is a flat `key → value` store with a `group` facet and
 * an `isPublic` flag. This module defines the known keys per group, the schema
 * each value must conform to, and whether the key is safe to expose to
 * unauthenticated callers via `/public/settings`.
 *
 * Unknown keys are allowed at the DB layer (custom white-label deployments) but
 * are never exposed publicly unless explicitly marked `isPublic=true` by an
 * admin — the public endpoint filters on the DB flag, not on this registry.
 */

export const SETTING_GROUPS = [
  'branding',
  'locale',
  'currency',
  'fees',
  'integrations',
  'security',
  'email',
  'general',
] as const;

export type SettingGroup = (typeof SETTING_GROUPS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'hex color');
const localeCode = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'locale tag');
const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO-4217');
const bps = z.number().int().min(0).max(10_000);

const BRANDING = {
  'branding.siteName': { isPublic: true, schema: z.string().min(1).max(60) },
  'branding.tagline': { isPublic: true, schema: z.string().max(140) },
  'branding.logoUrl': { isPublic: true, schema: z.string().url() },
  'branding.faviconUrl': { isPublic: true, schema: z.string().url() },
  'branding.primaryColor': { isPublic: true, schema: hexColor },
  'branding.accentColor': { isPublic: true, schema: hexColor },
  'branding.backgroundColor': { isPublic: true, schema: hexColor },
  'branding.gradientFrom': { isPublic: true, schema: hexColor },
  'branding.gradientTo': { isPublic: true, schema: hexColor },
} as const;

const LOCALE = {
  'locale.defaultLocale': { isPublic: true, schema: localeCode },
  'locale.supportedLocales': { isPublic: true, schema: z.array(localeCode).min(1) },
  'locale.rtlLocales': { isPublic: true, schema: z.array(localeCode) },
} as const;

const CURRENCY = {
  'currency.defaultCurrency': { isPublic: true, schema: currencyCode },
  'currency.supportedCurrencies': { isPublic: true, schema: z.array(currencyCode).min(1) },
  'currency.fxRateSource': { isPublic: false, schema: z.enum(['manual', 'ecb', 'openexchange']) },
} as const;

const FEES = {
  'fees.platformCommissionBps': { isPublic: false, schema: bps },
  'fees.stripePassthrough': { isPublic: false, schema: z.boolean() },
  'fees.minPayoutCents': { isPublic: false, schema: z.number().int().nonnegative() },
  'fees.adsCpmMinCents': { isPublic: false, schema: z.number().int().nonnegative() },
  'fees.adsCpcMinCents': { isPublic: false, schema: z.number().int().nonnegative() },
} as const;

const INTEGRATIONS = {
  'integrations.resendFromName': { isPublic: false, schema: z.string().min(1).max(60) },
  'integrations.resendFromEmail': { isPublic: false, schema: z.string().email() },
  'integrations.resendReplyTo': { isPublic: false, schema: z.string().email() },
  'integrations.supportEmail': { isPublic: true, schema: z.string().email() },
  'integrations.supportUrl': { isPublic: true, schema: z.string().url() },
} as const;

const SECURITY = {
  'security.sessionTtlMinutes': { isPublic: false, schema: z.number().int().min(5).max(43_200) },
  'security.passwordMinLength': { isPublic: false, schema: z.number().int().min(8).max(128) },
  'security.requireMfaForAdmin': { isPublic: false, schema: z.boolean() },
  'security.allowSignups': { isPublic: true, schema: z.boolean() },
  'security.allowCompanySignups': { isPublic: true, schema: z.boolean() },
  'security.allowTrainerSignups': { isPublic: true, schema: z.boolean() },
} as const;

const EMAIL = {
  'email.headerFooter': { isPublic: false, schema: z.object({ headerHtml: z.string().max(20_000).optional(), footerHtml: z.string().max(20_000).optional() }) },
  'email.digestEnabled': { isPublic: false, schema: z.boolean() },
} as const;

export const SETTING_REGISTRY = {
  ...BRANDING,
  ...LOCALE,
  ...CURRENCY,
  ...FEES,
  ...INTEGRATIONS,
  ...SECURITY,
  ...EMAIL,
} as const;

export type KnownSettingKey = keyof typeof SETTING_REGISTRY;

export function isKnownSetting(key: string): key is KnownSettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_REGISTRY, key);
}

export function settingGroup(key: KnownSettingKey): SettingGroup {
  const prefix = key.split('.', 1)[0] as SettingGroup;
  return (SETTING_GROUPS as readonly string[]).includes(prefix) ? (prefix as SettingGroup) : 'general';
}

/**
 * Validate a single setting value against the registry. Unknown keys accept
 * any JSON; known keys are type-checked.
 */
export function validateSettingValue(key: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!isKnownSetting(key)) return { ok: true, value };
  const res = SETTING_REGISTRY[key].schema.safeParse(value);
  if (!res.success) return { ok: false, error: res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') };
  return { ok: true, value: res.data };
}

export const settingUpsertInput = z.object({
  key: z.string().min(1).max(120),
  value: z.any(),
  group: z.enum(SETTING_GROUPS).optional(),
  isPublic: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

export type SettingUpsertInput = z.infer<typeof settingUpsertInput>;

export const bulkSettingUpsertInput = z.object({
  items: z.array(settingUpsertInput).min(1).max(200),
});

export type BulkSettingUpsertInput = z.infer<typeof bulkSettingUpsertInput>;

export interface PublicSetting {
  key: string;
  value: unknown;
  group: string;
}

export interface AdminSetting extends PublicSetting {
  isPublic: boolean;
  description: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

// -------------------- Feature flags --------------------

/**
 * A flag's `payload` JSON column — validated at admin write time, evaluated at
 * read time in `FeatureFlagEvaluator`. Missing fields default to "always on if
 * `enabled`".
 */
export const flagAudienceSchema = z.object({
  roles: z.array(z.enum(['SUPER_ADMIN', 'ADMIN', 'COMPANY_OWNER', 'COMPANY_MEMBER', 'TRAINER'])).optional(),
  userIds: z.array(z.string().min(1)).optional(),
  emails: z.array(z.string().email()).optional(),
  countries: z.array(z.string().length(2)).optional(),
  locales: z.array(localeCode).optional(),
});

export type FlagAudience = z.infer<typeof flagAudienceSchema>;

export const flagVariantSchema = z.object({
  key: z.string().min(1).max(60),
  weight: z.number().int().min(0).max(100),
  payload: z.any().optional(),
});

export type FlagVariant = z.infer<typeof flagVariantSchema>;

export const flagPayloadSchema = z
  .object({
    rolloutPercent: z.number().int().min(0).max(100).optional(),
    audiences: z.array(flagAudienceSchema).optional(),
    variants: z.array(flagVariantSchema).optional(),
  })
  .refine(
    (p) => !p.variants || p.variants.reduce((s, v) => s + v.weight, 0) <= 100,
    { message: 'variant weights must sum to ≤ 100' },
  );

export type FlagPayload = z.infer<typeof flagPayloadSchema>;

export const flagUpsertInput = z.object({
  key: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'lowercase alphanumeric with . _ -'),
  description: z.string().max(500).optional().nullable(),
  enabled: z.boolean(),
  payload: flagPayloadSchema.nullable().optional(),
});

export type FlagUpsertInput = z.infer<typeof flagUpsertInput>;

export interface FlagContext {
  userId?: string | null;
  email?: string | null;
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'COMPANY_OWNER' | 'COMPANY_MEMBER' | 'TRAINER' | null;
  country?: string | null;
  locale?: string | null;
}

export interface FlagEvaluation {
  key: string;
  enabled: boolean;
  variant: string | null;
  reason: 'disabled' | 'audience-match' | 'rollout-included' | 'rollout-excluded' | 'audience-mismatch' | 'no-such-flag';
  payload: unknown;
}
