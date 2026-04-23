import type { RenderedEmail, TestAssignedParams } from '../email.types';
import { escapeHtml, renderButton, renderLayout } from './layout';

export function renderTestAssigned(params: TestAssignedParams): RenderedEmail {
  const { locale, name, companyName, testTitle, takeUrl, timeLimitMin } = params;

  if (locale === 'ar') {
    const subject = `اختبار جديد: ${testTitle} — Trainova AI`;
    const cta = 'ابدأ الاختبار';
    const timeNote = timeLimitMin
      ? `<p style="font-size:13px;color:#475569;">المدة الزمنية: ${timeLimitMin} دقيقة.</p>`
      : '';
    const body = `
      <p>مرحباً ${escapeHtml(name)}،</p>
      <p>كلّفتك شركة <strong>${escapeHtml(companyName)}</strong> بإكمال اختبار «${escapeHtml(testTitle)}» كجزء من طلبك.</p>
      ${renderButton(locale, takeUrl, cta)}
      ${timeNote}
      <p style="font-size:13px;color:#475569;">بعد التسليم، سيقوم فريق الشركة بمراجعة إجاباتك واتخاذ القرار.</p>
    `;
    const text = [
      `مرحباً ${name}،`,
      '',
      `كلّفتك شركة ${companyName} بإكمال اختبار "${testTitle}".`,
      takeUrl,
      '',
      timeLimitMin ? `المدة الزمنية: ${timeLimitMin} دقيقة.` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return { subject, html: renderLayout(locale, body), text };
  }

  const subject = `New test: ${testTitle} — Trainova AI`;
  const cta = 'Start test';
  const timeNote = timeLimitMin
    ? `<p style="font-size:13px;color:#475569;">Time limit: ${timeLimitMin} minutes.</p>`
    : '';
  const body = `
    <p>Hi ${escapeHtml(name)},</p>
    <p><strong>${escapeHtml(companyName)}</strong> has assigned you the <em>${escapeHtml(testTitle)}</em> test as part of your application.</p>
    ${renderButton(locale, takeUrl, cta)}
    ${timeNote}
    <p style="font-size:13px;color:#475569;">After you submit, the company will review your answers and make a decision.</p>
  `;
  const text = [
    `Hi ${name},`,
    '',
    `${companyName} has assigned you the "${testTitle}" test.`,
    takeUrl,
    '',
    timeLimitMin ? `Time limit: ${timeLimitMin} minutes.` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return { subject, html: renderLayout(locale, body), text };
}
