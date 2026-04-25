import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type {
  ContractDocumentKind,
  ContractTemplateStatus,
} from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';

interface TemplateRow {
  id: string;
  kind: ContractDocumentKind;
  slug: string;
  name: string;
  description: string | null;
  locale: string;
  status: ContractTemplateStatus;
  updatedAt: string;
}

const STATUS_BADGE: Record<ContractTemplateStatus, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 ring-amber-200',
  PUBLISHED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  ARCHIVED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function AdminContractTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    kind?: ContractDocumentKind;
    status?: ContractTemplateStatus;
  }>;
}) {
  const { locale } = await params;
  const filters = await searchParams;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/contract-templates`);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    redirect(`/${locale}/dashboard`);
  }
  const qs = new URLSearchParams();
  if (filters.kind) qs.set('kind', filters.kind);
  if (filters.status) qs.set('status', filters.status);
  const path = `/admin/contract-templates${qs.toString() ? `?${qs.toString()}` : ''}`;
  const [rows, t] = await Promise.all([
    authedFetch<TemplateRow[]>(path).catch(() => [] as TemplateRow[]),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('admin.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/contract-templates/new`}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          {t('admin.newTemplate')}
        </Link>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.filterKind')}
          <select
            name="kind"
            defaultValue={filters.kind ?? ''}
            className="rounded-lg border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="">{t('admin.all')}</option>
            <option value="NDA">NDA</option>
            <option value="MSA">MSA</option>
            <option value="SOW">SOW</option>
            <option value="CUSTOM">{t('admin.kindCustom')}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.filterStatus')}
          <select
            name="status"
            defaultValue={filters.status ?? ''}
            className="rounded-lg border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
          >
            <option value="">{t('admin.all')}</option>
            <option value="DRAFT">{t('admin.statusDraft')}</option>
            <option value="PUBLISHED">{t('admin.statusPublished')}</option>
            <option value="ARCHIVED">{t('admin.statusArchived')}</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          {t('admin.applyFilters')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.col.name')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.kind')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.locale')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.updated')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-slate-500">
                  {t('admin.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/${locale}/admin/contract-templates/${r.id}`}
                    className="font-medium text-brand-700 hover:text-brand-800"
                  >
                    {r.name}
                  </Link>
                  <div className="text-xs text-slate-500">{r.slug}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{r.kind}</td>
                <td className="px-4 py-3 text-slate-700">{r.locale}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[r.status]}`}
                  >
                    {t(`admin.status${r.status[0]}${r.status.slice(1).toLowerCase()}` as 'admin.statusDraft')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(r.updatedAt).toLocaleDateString(locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
