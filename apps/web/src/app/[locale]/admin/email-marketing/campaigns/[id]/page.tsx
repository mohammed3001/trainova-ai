import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import {
  ADMIN_ROLE_GROUPS,
  type EmailCampaignStatus,
  type EmailSegment,
} from '@trainova/shared';
import { CampaignForm } from '../campaign-form';
import { CampaignActions } from '../campaign-actions';

interface Campaign {
  id: string;
  name: string;
  status: EmailCampaignStatus;
  locale: 'en' | 'ar' | 'fr' | 'es';
  subject: string;
  bodyHtml: string;
  bodyText: string;
  segmentJson: EmailSegment | null;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  _count: { sends: number };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminEmailCampaignDetailPage({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const campaign = await authedFetch<Campaign>(`/admin/email/campaigns/${id}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            className="text-sm text-slate-500 hover:underline"
            href={`/${locale}/admin/email-marketing/campaigns`}
          >
            ← {t('admin.emailMarketing.backToList')}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{campaign.name}</h1>
          <p className="mt-1 text-sm text-slate-600">{campaign.subject}</p>
        </div>
        <CampaignActions campaign={campaign} />
      </header>

      <div className="card grid gap-3 bg-white/70 sm:grid-cols-4">
        <Stat label={t('admin.emailMarketing.stats.status')} value={t(`admin.emailMarketing.status.${campaign.status}`)} />
        <Stat label={t('admin.emailMarketing.stats.sent')} value={String(campaign.sentCount)} />
        <Stat label={t('admin.emailMarketing.stats.failed')} value={String(campaign.failedCount)} />
        <Stat
          label={t('admin.emailMarketing.stats.recipients')}
          value={String(campaign._count.sends)}
        />
      </div>

      <CampaignForm
        mode="edit"
        defaults={{
          id: campaign.id,
          name: campaign.name,
          locale: campaign.locale,
          subject: campaign.subject,
          bodyHtml: campaign.bodyHtml,
          bodyText: campaign.bodyText,
          scheduledFor: campaign.scheduledFor,
          segment: campaign.segmentJson ?? undefined,
          status: campaign.status,
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
    </div>
  );
}
