import type { RenderedEmail, ResetPasswordParams } from '../email.types';
import { renderButton, renderLayout } from './layout';

export function renderResetPassword(params: ResetPasswordParams): RenderedEmail {
  const { locale, name, resetUrl, expiresInMinutes } = params;

  if (locale === 'ar') {
    const subject = 'إعادة تعيين كلمة المرور — Trainova AI';
    const cta = 'إعادة تعيين كلمة المرور';
    const body = `
      <p>مرحباً ${escape(name)}،</p>
      <p>استلمنا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.</p>
      ${renderButton(locale, resetUrl, cta)}
      <p style="font-size:13px;color:#475569;">ينتهي صلاحية هذا الرابط خلال ${expiresInMinutes} دقيقة ويمكن استخدامه مرة واحدة فقط. إذا لم تطلب ذلك يمكنك تجاهل هذه الرسالة — كلمة مرورك الحالية لن تتغير.</p>
    `;
    const text = [
      `مرحباً ${name}،`,
      '',
      'استلمنا طلباً لإعادة تعيين كلمة المرور. افتح الرابط التالي لاختيار كلمة مرور جديدة:',
      resetUrl,
      '',
      `ينتهي صلاحية هذا الرابط خلال ${expiresInMinutes} دقيقة ويمكن استخدامه مرة واحدة فقط.`,
    ].join('\n');
    return { subject, html: renderLayout(locale, body), text };
  }

  const subject = 'Reset your password — Trainova AI';
  const cta = 'Reset password';
  const body = `
    <p>Hi ${escape(name)},</p>
    <p>We received a request to reset the password for your account. Click the button below to choose a new password.</p>
    ${renderButton(locale, resetUrl, cta)}
    <p style="font-size:13px;color:#475569;">This link expires in ${expiresInMinutes} minutes and can only be used once. If you didn't request this, you can safely ignore this email — your current password will stay the same.</p>
  `;
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your password. Open the following link to choose a new password:',
    resetUrl,
    '',
    `This link expires in ${expiresInMinutes} minutes and can only be used once.`,
  ].join('\n');
  return { subject, html: renderLayout(locale, body), text };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
