/**
 * Curated list of disposable / temporary email domains. Not exhaustive —
 * the upstream community list runs to ~100k entries and bloats the bundle —
 * but covers the most common throwaway providers seen in abuse signals.
 *
 * Matched case-insensitively against the part of the trainer email that
 * follows the final '@'. Subdomains do NOT match by default; add the parent
 * domain explicitly if you want subdomain coverage.
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  '0-mail.com',
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'anonbox.net',
  'anonymbox.com',
  'discard.email',
  'discardmail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'hidemail.de',
  'inboxbear.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailsac.com',
  'mintemail.com',
  'mohmal.com',
  'moakt.com',
  'mytemp.email',
  'nada.email',
  'nada.ltd',
  'no-spam.ws',
  'sharklasers.com',
  'spam4.me',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.io',
  'tempmail.net',
  'temp-mail.org',
  'temp-mail.io',
  'tempmailo.com',
  'throwaway.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'trashmail.net',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain) return false;
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}
