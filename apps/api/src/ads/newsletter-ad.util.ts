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
  const headline = escapeHtml(creative.headline);
  const body = creative.body ? escapeHtml(creative.body) : '';
  const cta = escapeHtml(creative.ctaLabel?.trim() || 'Learn more');
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
  const lines = [
    '— Sponsored —',
    creative.headline,
    creative.body ?? '',
    `${creative.ctaLabel?.trim() || 'Learn more'}: ${clickUrl}`,
  ];
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
 * Replace `NEWSLETTER_AD_TOKEN` in `bodyHtml` and `bodyText` with the rendered
 * ad fragments. If `ad === null`, the token is stripped (so the email reads
 * cleanly as if no slot existed).
 */
export function applyNewsletterAd<T extends string | null>(
  bodyHtml: string,
  bodyText: T,
  ad: RenderedAd | null,
): { bodyHtml: string; bodyText: T } {
  const html = bodyHtml.includes(NEWSLETTER_AD_TOKEN)
    ? bodyHtml.split(NEWSLETTER_AD_TOKEN).join(ad?.html ?? '')
    : bodyHtml;
  const text =
    bodyText && bodyText.includes(NEWSLETTER_AD_TOKEN)
      ? (bodyText.split(NEWSLETTER_AD_TOKEN).join(ad?.text ?? '') as T)
      : bodyText;
  return { bodyHtml: html, bodyText: text };
}
