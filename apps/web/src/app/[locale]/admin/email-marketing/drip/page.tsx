import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ADMIN_ROLE_GROUPS, type EmailDripTrigger } from '@trainova/shared';

interface Row {
  id: string;
  name: string;
  slug: string;
  trigger: EmailDripTrigger;
  enabled: boolean;
  createdAt: string;
  _count: { steps: number; enrollments: number };
  createdBy: { id: string; name: string; email: string } | null;
}

export default async function AdminDripSequencesPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const rows = await authedFetch<Row[]>('/admin/email/drip');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.emailMarketing.drip.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('admin.emailMarketing.drip.subtitle')}
          </p>
        </div>
        <Link className="btn-primary" href={`/${locale}/admin/email-marketing/drip/new`}>
          {t('admin.emailMarketing.drip.new')}
        </Link>
      </header>

      <div className="card overflow-x-auto bg-white/70">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.drip.col_name')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.drip.col_trigger')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.drip.col_enabled')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailMarketing.drip.col_steps')}</th>
              <th className="px-4 py-3 text-start">
                {t('admin.emailMarketing.drip.col_enrollments')}
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  {t('admin.emailMarketing.drip.empty')}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.slug}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {t(`admin.emailMarketing.drip.trigger.${row.trigger}`)}
                </td>
                <td className="px-4 py-3">
                  {row.enabled ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                      {t('admin.emailMarketing.drip.on')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {t('admin.emailMarketing.drip.off')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700">{row._count.steps}</td>
                <td className="px-4 py-3 text-slate-700">{row._count.enrollments}</td>
                <td className="px-4 py-3 text-end">
                  <Link
                    className="text-sm font-medium text-teal-600 hover:underline"
                    href={`/${locale}/admin/email-marketing/drip/${row.id}`}
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
