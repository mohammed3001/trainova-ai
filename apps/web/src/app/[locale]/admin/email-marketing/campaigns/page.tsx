import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import type { EmailCampaignStatus } from '@trainova/shared';

interface Row {
  id: string;
  name: string;
  status: EmailCampaignStatus;
  locale: string;
  subject: string;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  createdBy: { id: string; name: string; email: string } | null;
  _count: { sends: number };
}

interface ListResponse {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
}

interface PageProps {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}

const STATUS_BADGE: Record<EmailCampaignStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SCHEDULED: 'bg-amber-100 text-amber-800',
  SENDING: 'bg-blue-100 text-blue-800',
  SENT: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-500',
  FAILED: 'bg-rose-100 text-rose-800',
};

export default async function AdminEmailCampaignsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const qs = new URLSearchParams();
  if (sp.status) qs.set('status', sp.status);
  if (sp.q) qs.set('q', sp.q);
  if (sp.page) qs.set('page', sp.page);

  const data = await authedFetch<ListResponse>(
    `/admin/email/campaigns${qs.toString() ? `?${qs}` : ''}`,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.emailMarketing.campaigns.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('admin.emailMarketing.campaigns.subtitle')}
          </p>
        </div>
        <Link className="btn-primary" href={`/${locale}/admin/email-marketing/campaigns/new`}>
          {t('admin.emailMarketing.campaigns.new')}
        </Link>
      </header>

      <form className="card flex flex-wrap items-end gap-3 bg-white/70" action="" method="get">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailMarketing.filters.status')}
          <select
            name="status"
            defaultValue={sp.status ?? ''}
            className="input min-w-[10rem]"
          >
            <option value="">{t('admin.emailMarketing.filters.any')}</option>
            <option value="DRAFT">{t('admin.emailMarketing.status.DRAFT')}</option>
            <option value="SCHEDULED">{t('admin.emailMarketing.status.SCHEDULED')}</option>
            <option value="SENDING">{t('admin.emailMarketing.status.SENDING')}</option>
            <option value="SENT">{t('admin.emailMarketing.status.SENT')}</option>
            <option value="CANCELLED">{t('admin.emailMarketing.status.CANCELLED')}</option>
            <option value="FAILED">{t('admin.emailMarketing.status.FAILED')}</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailMarketing.filters.search')}
          <input name="q" defaultValue={sp.q ?? ''} className="input" />
        </label>
        <button type="submit" className="btn-secondary">
          {t('admin.emailMarketing.filters.apply')}
        </button>
      </form>

      <div className="card overflow-x-auto bg-white/70">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.columns.name')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.columns.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.columns.locale')}</th>
              <th className="px-4 py-3 text-start">
                {t('admin.emailMarketing.columns.scheduledFor')}
              </th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.columns.sent')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.columns.failed')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                  {t('admin.emailMarketing.empty')}
                </td>
              </tr>
            )}
            {data.items.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.subject}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status]}`}
                  >
                    {t(`admin.emailMarketing.status.${row.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 uppercase text-slate-700">{row.locale}</td>
                <td className="px-4 py-3 text-slate-700">
                  {row.scheduledFor
                    ? new Date(row.scheduledFor).toLocaleString(locale)
                    : '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">{row.sentCount}</td>
                <td className="px-4 py-3 text-slate-700">{row.failedCount}</td>
                <td className="px-4 py-3 text-end">
                  <Link
                    className="text-sm font-medium text-teal-600 hover:underline"
                    href={`/${locale}/admin/email-marketing/campaigns/${row.id}`}
                  >
                    {t('admin.emailMarketing.open')}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
