import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { WebhooksClient, type WebhookRow } from './webhooks-client';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function CompanyIntegrationsPage({ params }: Props) {
  const { locale } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/integrations`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const [webhooks, eventsRes, t] = await Promise.all([
    authedFetch<WebhookRow[]>('/company/webhooks').catch(() => [] as WebhookRow[]),
    authedFetch<{ events: string[] }>('/company/webhooks/events').catch(() => ({
      events: [] as string[],
    })),
    getTranslations({ locale, namespace: 'integrations' }),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t('webhooks.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('webhooks.subtitle')}</p>
      </header>
      <WebhooksClient initial={webhooks} events={eventsRes.events} />
    </div>
  );
}
