/**
 * T6.A — User display preferences (locale, timezone, currency).
 *
 * The platform's identity & auth schema stores the source of truth on
 * `User.locale`, `User.timezone`, `User.currencyPreference`. The UI
 * resolves the active values at request time from cookie → user row →
 * fallback so anonymous visitors get a consistent default and signed-in
 * users get a sticky preference across devices.
 */

import { z } from 'zod';
import { SUPPORTED_DISPLAY_CURRENCIES, currencyCodeSchema } from './currency';

/** All UI locales the platform formally translates today. */
export const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'es'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * IANA timezone identifier — validated at runtime via Intl when available
 * and otherwise loosely shaped (Region/City). We intentionally avoid an
 * enum so users in less-common zones (e.g. America/Argentina/Cordoba)
 * aren't silently downgraded to UTC.
 */
const ianaShape = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z][A-Za-z0-9_+\-]*)+$/;
const SHORT_TZS = new Set(['UTC', 'GMT', 'Z']);
export const timezoneSchema = z
  .string()
  .min(2)
  .max(64)
  .refine(
    (val) => SHORT_TZS.has(val) || ianaShape.test(val),
    'must be an IANA timezone identifier (e.g. Europe/Paris) or UTC',
  );

export const updatePreferencesSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).optional(),
  timezone: timezoneSchema.nullable().optional(),
  currencyPreference: z
    .enum(SUPPORTED_DISPLAY_CURRENCIES as unknown as [string, ...string[]])
    .nullable()
    .optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const preferencesResponseSchema = z.object({
  locale: z.string(),
  timezone: z.string().nullable(),
  currencyPreference: currencyCodeSchema.nullable(),
});
export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>;
