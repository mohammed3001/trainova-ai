import { z } from 'zod';

/**
 * White-label v2 (T9.N).
 *
 * Adds two layers on top of the per-company `logoUrl` that already
 * existed on Company:
 *
 *   1. **Branding tokens** — a primary and secondary hex color that
 *      become CSS variables on any surface scoped to that company.
 *      The colors can be set directly (custom) or via a curated
 *      preset; we record which preset was last applied so the UI can
 *      highlight the active card without inferring from the colors.
 *
 *   2. **Agency hierarchy** — one Company may be marked as the
 *      parent agency of N child companies. The schema is a
 *      self-referential FK on Company.parentAgencyId, set by admin
 *      operators (CONTENT group). The owner of a parent agency sees
 *      a roll-up dashboard of child companies; otherwise the link is
 *      informational.
 *
 * Both pieces are intentionally additive and do not depend on the
 * custom-domain / DNS verification work in T9.C — they ship value
 * even when the domain feature is not yet enabled.
 */

export const BRANDING_PRESET_KEYS = [
  'CORPORATE_BLUE',
  'MINIMAL_GREEN',
  'BOLD_PURPLE',
  'NEUTRAL_GRAY',
] as const;
export type BrandingPresetKey = (typeof BRANDING_PRESET_KEYS)[number];

export interface BrandingPreset {
  key: BrandingPresetKey;
  label: string;
  primary: string;
  secondary: string;
}

/**
 * Curated presets. Hex values are AA-contrast safe against white
 * (primary) and against the secondary tint. Adding a new preset is a
 * pure data change here + adding the enum value to the Prisma enum.
 */
export const BRANDING_PRESETS: Record<BrandingPresetKey, BrandingPreset> = {
  CORPORATE_BLUE: {
    key: 'CORPORATE_BLUE',
    label: 'Corporate Blue',
    primary: '#1e3a8a',
    secondary: '#dbeafe',
  },
  MINIMAL_GREEN: {
    key: 'MINIMAL_GREEN',
    label: 'Minimal Green',
    primary: '#15803d',
    secondary: '#dcfce7',
  },
  BOLD_PURPLE: {
    key: 'BOLD_PURPLE',
    label: 'Bold Purple',
    primary: '#6b21a8',
    secondary: '#f3e8ff',
  },
  NEUTRAL_GRAY: {
    key: 'NEUTRAL_GRAY',
    label: 'Neutral Gray',
    primary: '#374151',
    secondary: '#f3f4f6',
  },
};

/** Strict 6-digit hex — we don't accept named colors or 3-digit shorthand. */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Owner-side branding update. Either color may be set or cleared
 * independently. Setting a color manually does NOT clear the preset
 * key automatically — the API does that, since `presetKey` is meant
 * to mean "matches one of the curated presets exactly".
 */
export const updateBrandingSchema = z
  .object({
    brandPrimaryColor: z.string().regex(HEX_COLOR, 'Must be #RRGGBB').nullable().optional(),
    brandSecondaryColor: z.string().regex(HEX_COLOR, 'Must be #RRGGBB').nullable().optional(),
  })
  .strict();
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

/** Apply a curated preset (writes both colors atomically). */
export const applyBrandingPresetSchema = z
  .object({
    presetKey: z.enum(BRANDING_PRESET_KEYS),
  })
  .strict();
export type ApplyBrandingPresetInput = z.infer<typeof applyBrandingPresetSchema>;

/**
 * Admin-side: link a company to a parent agency, or unlink with
 * `parentCompanyId: null`. The service layer rejects self-link and
 * cycles.
 */
export const linkAgencySchema = z
  .object({
    parentCompanyId: z.string().min(1).nullable(),
  })
  .strict();
export type LinkAgencyInput = z.infer<typeof linkAgencySchema>;

export const PUBLIC_BRANDING_FIELDS = [
  'brandPrimaryColor',
  'brandSecondaryColor',
  'brandPresetKey',
  'logoUrl',
] as const;
