import type { Locale } from '../email.types';

const BRAND = {
  name: 'Trainova AI',
  accent: '#0ea5a4',
  text: '#0f172a',
  muted: '#475569',
  surface: '#ffffff',
  background: '#f1f5f9',
};

export function renderLayout(locale: Locale, bodyHtml: string): string {
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const lang = locale;
  const footer = locale === 'ar'
    ? 'أرسلت هذه الرسالة من Trainova AI. إذا لم تطلبها يمكنك تجاهلها بأمان.'
    : 'This email was sent by Trainova AI. If you did not request it, you can safely ignore this message.';

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${BRAND.name}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.background};color:${BRAND.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.background};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.surface};border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding-bottom:24px;">
                <div style="font-weight:700;font-size:20px;color:${BRAND.accent};">${BRAND.name}</div>
              </td>
            </tr>
            <tr>
              <td style="font-size:16px;line-height:1.6;color:${BRAND.text};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding-top:32px;font-size:12px;color:${BRAND.muted};border-top:1px solid #e2e8f0;margin-top:24px;">
                ${footer}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderButton(locale: Locale, url: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${url}"
       style="display:inline-block;background:#0ea5a4;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">
      ${label}
    </a>
  </p>
  <p style="margin:0 0 16px 0;font-size:13px;color:#475569;">
    ${locale === 'ar' ? 'أو انسخ هذا الرابط والصقه في المتصفح:' : 'Or copy and paste this URL into your browser:'}
  </p>
  <p style="margin:0 0 24px 0;font-size:13px;word-break:break-all;">
    <a href="${url}" style="color:#0ea5a4;">${url}</a>
  </p>`;
}
