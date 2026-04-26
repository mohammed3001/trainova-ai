import { createHash } from 'node:crypto';
import type { AdsService } from './ads.service';

/**
 * T9.F — newsletter ad slot.
 *
 * The token a campaign author drops into `bodyHtml` / `bodyText` to opt the
 * email into a sponsored slot. Picked deliberately verbose so it can never
 * collide with a real translated phrase.
 */
export const NEWSLETTER_AD_TOKEN = '{{AD_SLOT}}';

/**
 * Whitespace-tolerant token regex matching the same shape as the email
 * template interpolator (`/\{\{\s*AD_SLOT\s*\}\}/g`). Authors writing
 * `{{ AD_SLOT }}` with surrounding spaces are treated identically to the
 * canonical `{{AD_SLOT}}`. Used for both the opt-in detection and the
 * substitution / strip pass so a normalised token can never leak into the
 * final email.
 */
export const NEWSLETTER_AD_TOKEN_REGEX = /\{\{\s*AD_SLOT\s*\}\}/g;

/** Cheap detection helper that accepts the same whitespace tolerance. */
export function hasNewsletterAdToken(s: string | null | undefined): boolean {
  if (!s) return false;
  // Reset lastIndex because the exported regex has the `g` flag.
  NEWSLETTER_AD_TOKEN_REGEX.lastIndex = 0;
  return NEWSLETTER_AD_TOKEN_REGEX.test(s);
}

interface RecipientCtx {
  campaignId: string;
  recipientId: string;
  recipientEmail: string;
  locale: 'en' | 'ar' | 'fr' | 'es';
}

/**
 * Stable per-(campaign, recipient) "session hash" used by AdsService for
 * frequency-cap accounting and impression dedup. Hashing the email address
 * keeps PII out of the AdImpression row while still letting Promise<sponsor>
 * see "this user already saw this ad once" through the existing cap logic.
 */
function newsletterSessionHash(campaignId: string, recipientEmail: string): string {
  return createHash('sha256')
    .update(`newsletter::${campaignId}::${recipientEmail}`)
    .digest('hex')
    .slice(0, 32);
}

interface RenderedAd {
  creativeId: string;
  html: string;
  text: string;
}

/**
 * Pick at most one active NEWSLETTER-placed creative for the campaign locale,
 * record an impression against the recipient's stable session hash, and
 * return the rendered HTML + plain-text fragments to inject in place of
 * NEWSLETTER_AD_TOKEN.
 *
 * Returns `null` (no ad) when:
 *   - no eligible creative exists (no active campaigns, all out of budget,
 *     locale targeting excludes everyone)
 *   - the impression record was skipped by the budget / frequency-cap guard
 *     in AdsService.recordImpression (we deliberately don't render the slot
 *     at all in that case so the recipient never sees a "you already saw
 *     this" repeat or a paid-for-but-no-impression render).
 *
 * Caller is responsible for replacing the token; this helper does no string
 * mutation on bodyHtml/bodyText itself.
 */
export async function pickAndRecordNewsletterAd(
  ads: AdsService,
  appBaseUrl: string,
  ctx: RecipientCtx,
): Promise<RenderedAd | null> {
  const sessionHash = newsletterSessionHash(ctx.campaignId, ctx.recipientEmail);
  const candidates = await ads.serveAds(
    {
      placement: 'NEWSLETTER',
      locale: ctx.locale,
      country: undefined,
      skillIds: undefined,
      limit: 1,
    },
    { sessionHash, userId: ctx.recipientId },
  );
  const creative = candidates[0];
  if (!creative) return null;

  const impression = await ads.recordImpression(
    { creativeId: creative.id, placement: 'NEWSLETTER' },
    {
      sessionHash,
      userId: ctx.recipientId,
      locale: ctx.locale,
    },
  );
  if (impression.skipped) return null;

  const clickUrl = buildNewsletterClickUrl(appBaseUrl, creative.id);
  return {
    creativeId: creative.id,
    html: renderHtmlBlock(creative, clickUrl),
    text: renderTextBlock(creative, clickUrl),
  };
}

function buildNewsletterClickUrl(appBaseUrl: string, creativeId: string): string {
  const base = appBaseUrl.replace(/\/+$/, '');
  return `${base}/api/ads/click/${encodeURIComponent(creativeId)}?p=NEWSLETTER`;
}

/**
 * HTML email-safe ad block. Avoids external CSS / web fonts / JS so the
 * fragment renders identically across Gmail / Outlook / Apple Mail. All
 * styling is inline.
 */
function renderHtmlBlock(
  creative: { headline: string; body: string | null; ctaLabel: string | null },
  clickUrl: string,
): string {
  // Belt-and-braces against template-injection: even though the email-marketing
  // service pre-interpolates the body before calling applyNewsletterAd, we
  // also strip `{{varName}}` recognition from advertiser-controlled strings so
  // a future caller that forgets to pre-interpolate can't leak `{{name}}` via
  // a hostile creative headline. escapeHtml + neutraliseTemplateBraces both
  // run on every advertiser-authored field below.
  const headline = neutraliseTemplateBraces(escapeHtml(creative.headline));
  const body = creative.body ? neutraliseTemplateBraces(escapeHtml(creative.body)) : '';
  const cta = neutraliseTemplateBraces(
    escapeHtml(creative.ctaLabel?.trim() || 'Learn more'),
  );
  const href = escapeHtmlAttr(clickUrl);
  return [
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;border-collapse:collapse;">',
    '<tr><td style="padding:16px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">',
    '<div style="font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin-bottom:8px;">Sponsored</div>',
    `<div style="font-size:16px;font-weight:600;color:#0f172a;margin-bottom:6px;">${headline}</div>`,
    body ? `<div style="font-size:14px;line-height:1.5;color:#334155;margin-bottom:12px;">${body}</div>` : '',
    `<a href="${href}" style="display:inline-block;padding:8px 14px;background:#0f172a;color:#ffffff;font-size:14px;text-decoration:none;border-radius:6px;">${cta}</a>`,
    '</td></tr></table>',
  ].join('');
}

function renderTextBlock(
  creative: { headline: string; body: string | null; ctaLabel: string | null },
  clickUrl: string,
): string {
  // Plain-text path has no HTML escaping layer to neutralise `{{varName}}`,
  // so we strip the template syntax explicitly on advertiser fields.
  const headline = neutraliseTemplateBracesText(creative.headline);
  const body = creative.body ? neutraliseTemplateBracesText(creative.body) : '';
  const cta = neutraliseTemplateBracesText(creative.ctaLabel?.trim() || 'Learn more');
  const lines = ['— Sponsored —', headline, body, `${cta}: ${clickUrl}`];
  return lines.filter((l) => l.length > 0).join('\n');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeHtmlAttr(s: string): string {
  return escapeHtml(s);
}

/**
 * In the HTML path, replace `{` with the numeric entity `&#123;` so the
 * email-template interpolator's `/\{\{\s*\w+\s*\}\}/g` regex never matches
 * advertiser content. The browser / mail client renders `&#123;` as a literal
 * `{` for the recipient, so the user-visible text is unchanged.
 */
function neutraliseTemplateBraces(s: string): string {
  return s.replace(/\{/g, '&#123;');
}

/**
 * Plain-text equivalent: insert a zero-width space between consecutive `{`
 * (and between consecutive `}`) so `{{name}}` becomes `{\u200B{name}\u200B}`,
 * which no longer matches the interpolator regex but renders identically in
 * any reasonable plain-text reader. We do not strip the braces because some
 * advertisers may legitimately want them in the visible text.
 */
function neutraliseTemplateBracesText(s: string): string {
  return s.replace(/\{\{/g, '{\u200B{').replace(/\}\}/g, '}\u200B}');
}

/**
 * Replace `NEWSLETTER_AD_TOKEN` in `bodyHtml` and `bodyText` with the rendered
 * ad fragments. If `ad === null`, the token is stripped (so the email reads
 * cleanly as if no slot existed).
 */
export function applyNewsletterAd<T extends string | null>(
  bodyHtml: string,
  bodyText: T,
  ad: RenderedAd | null,
): { bodyHtml: string; bodyText: T } {
  const htmlReplacement = ad?.html ?? '';
  const textReplacement = ad?.text ?? '';
  // Use a function replacer (not a string) so `$&`, `` $` ``, `$'`, `$$`, `$N`
  // patterns inside advertiser-controlled `htmlReplacement` / `textReplacement`
  // are inserted literally instead of being interpreted by String.replace's
  // special replacement syntax. Mirrors the same approach taken by
  // `interpolateEmailTemplate` in packages/shared/src/email-templates.ts.
  const html = bodyHtml.replace(NEWSLETTER_AD_TOKEN_REGEX, () => htmlReplacement);
  const text = (
    bodyText
      ? (bodyText as string).replace(NEWSLETTER_AD_TOKEN_REGEX, () => textReplacement)
      : bodyText
  ) as T;
  return { bodyHtml: html, bodyText: text };
}
