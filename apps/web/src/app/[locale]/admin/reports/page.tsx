import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

type ReportStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
type ReportCategory =
  | 'SPAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE'
  | 'FRAUD'
  | 'IMPERSONATION'
  | 'COPYRIGHT'
  | 'SAFETY'
  | 'OTHER';
type ReportTarget =
  | 'USER'
  | 'COMPANY'
  | 'TRAINER'
  | 'REQUEST'
  | 'APPLICATION'
  | 'MESSAGE'
  | 'CONVERSATION'
  | 'REVIEW'
  | 'TEST'
  | 'OTHER';

interface Row {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  category: ReportCategory;
  status: ReportStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string; email: string };
  resolver: { id: string; name: string } | null;
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

const STATUSES: ReportStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
const CATEGORIES: ReportCategory[] = [
  'SPAM',
  'HARASSMENT',
  'INAPPROPRIATE',
  'FRAUD',
  'IMPERSONATION',
  'COPYRIGHT',
  'SAFETY',
  'OTHER',
];
const TARGETS: ReportTarget[] = [
  'USER',
  'COMPANY',
  'TRAINER',
  'REQUEST',
  'APPLICATION',
  'MESSAGE',
  'CONVERSATION',
  'REVIEW',
  'TEST',
  'OTHER',
];

const STATUS_STYLE: Record<ReportStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-700 ring-amber-200',
  INVESTIGATING: 'bg-sky-50 text-sky-700 ring-sky-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DISMISSED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    targetType?: string;
    category?: string;
    cursor?: string;
  }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.status && STATUSES.includes(sp.status as ReportStatus)) qs.set('status', sp.status);
  if (sp.targetType && TARGETS.includes(sp.targetType as ReportTarget)) {
    qs.set('targetType', sp.targetType);
  }
  if (sp.category && CATEGORIES.includes(sp.category as ReportCategory)) {
    qs.set('category', sp.category);
  }
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/reports?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.reports.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.reports.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.reports.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.reports.status.${s}` as 'admin.reports.status.OPEN')}
            </option>
          ))}
        </select>
        <select
          name="targetType"
          defaultValue={sp.targetType ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.reports.filter.allTargets')}</option>
          {TARGETS.map((x) => (
            <option key={x} value={x}>
              {t(`admin.reports.targetType.${x}` as 'admin.reports.targetType.USER')}
            </option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={sp.category ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.reports.filter.allCategories')}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`admin.reports.category.${c}` as 'admin.reports.category.SPAM')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.reports.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.target')}</th>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.category')}</th>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.reporter')}</th>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.resolution')}</th>
              <th className="px-4 py-3 text-start">{t('admin.reports.col.createdAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.reports.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/reports/${r.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {t(
                        `admin.reports.targetType.${r.targetType}` as 'admin.reports.targetType.USER',
                      )}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-400">{r.targetId}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t(`admin.reports.category.${r.category}` as 'admin.reports.category.SPAM')}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{r.reporter.name}</div>
                    <div className="text-[11px] text-slate-500">{r.reporter.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[r.status]}`}
                    >
                      {t(`admin.reports.status.${r.status}` as 'admin.reports.status.OPEN')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.resolution
                      ? t(
                          `admin.reports.resolution.${r.resolution}` as 'admin.reports.resolution.NO_ACTION',
                        )
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {page.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={{
              pathname: `/${locale}/admin/reports`,
              query: { ...sp, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
          >
            {t('admin.reports.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
