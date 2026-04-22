import type { RenderedEmail, VerifyEmailParams } from '../email.types';
import { escapeHtml, renderButton, renderLayout } from './layout';

export function renderVerifyEmail(params: VerifyEmailParams): RenderedEmail {
  const { locale, name, verifyUrl } = params;

  if (locale === 'ar') {
    const subject = 'تأكيد بريدك الإلكتروني — Trainova AI';
    const cta = 'تأكيد البريد الإلكتروني';
    const body = `
      <p>مرحباً ${escapeHtml(name)}،</p>
      <p>شكراً لإنشاء حساب على Trainova AI. للمتابعة، يرجى تأكيد بريدك الإلكتروني بالضغط على الزر أدناه.</p>
      ${renderButton(locale, verifyUrl, cta)}
      <p style="font-size:13px;color:#475569;">ينتهي صلاحية هذا الرابط خلال 24 ساعة. إذا لم تنشئ حساباً، يمكنك تجاهل هذه الرسالة.</p>
    `;
    const text = [
      `مرحباً ${name}،`,
      '',
      'شكراً لإنشاء حساب على Trainova AI. يرجى تأكيد بريدك الإلكتروني:',
      verifyUrl,
      '',
      'ينتهي صلاحية هذا الرابط خلال 24 ساعة.',
    ].join('\n');
    return { subject, html: renderLayout(locale, body), text };
  }

  const subject = 'Verify your email — Trainova AI';
  const cta = 'Verify email';
  const body = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for signing up to Trainova AI. To continue, please verify your email address by clicking the button below.</p>
    ${renderButton(locale, verifyUrl, cta)}
    <p style="font-size:13px;color:#475569;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
  `;
  const text = [
    `Hi ${name},`,
    '',
    'Thanks for signing up to Trainova AI. Please verify your email address:',
    verifyUrl,
    '',
    'This link expires in 24 hours.',
  ].join('\n');
  return { subject, html: renderLayout(locale, body), text };
}

