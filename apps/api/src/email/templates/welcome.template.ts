import type { RenderedEmail, WelcomeParams } from '../email.types';
import { renderButton, renderLayout } from './layout';

export function renderWelcome(params: WelcomeParams): RenderedEmail {
  const { locale, name, dashboardUrl } = params;

  if (locale === 'ar') {
    const subject = 'مرحباً بك في Trainova AI';
    const cta = 'فتح لوحة التحكم';
    const body = `
      <p>مرحباً ${escape(name)}،</p>
      <p>سعداء بانضمامك إلى Trainova AI — السوق العالمي والمنصة المعتمدة لتقييم مدربي الذكاء الاصطناعي. يمكنك الآن نشر الطلبات أو التقديم عليها وتقييم المدربين عبر الاختبارات التقنية ومحاكاة واجهات برمجية حقيقية.</p>
      ${renderButton(locale, dashboardUrl, cta)}
      <p style="font-size:13px;color:#475569;">إذا احتجت مساعدة فريقنا يسعده دعمك في أي وقت.</p>
    `;
    const text = [
      `مرحباً ${name}،`,
      '',
      'مرحباً بك في Trainova AI. افتح لوحة التحكم للبدء:',
      dashboardUrl,
    ].join('\n');
    return { subject, html: renderLayout(locale, body), text };
  }

  const subject = 'Welcome to Trainova AI';
  const cta = 'Open dashboard';
  const body = `
    <p>Hi ${escape(name)},</p>
    <p>Welcome to Trainova AI — the global marketplace and evaluation platform for AI training talent. You can now post or apply to requests and evaluate trainers with technical tests on real sandbox APIs.</p>
    ${renderButton(locale, dashboardUrl, cta)}
    <p style="font-size:13px;color:#475569;">Need help? Our team is happy to support you any time.</p>
  `;
  const text = [
    `Hi ${name},`,
    '',
    'Welcome to Trainova AI. Open your dashboard to get started:',
    dashboardUrl,
  ].join('\n');
  return { subject, html: renderLayout(locale, body), text };
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
