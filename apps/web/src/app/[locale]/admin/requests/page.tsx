import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  slug: string;
  title: string;
  status: 'DRAFT' | 'OPEN' | 'IN_REVIEW' | 'CLOSED' | 'ARCHIVED';
  featured: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  workType: string | null;
  currency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  company: { id: string; name: string; slug: string; verified: boolean };
  _count: { applications: number; tests: number };
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

const STATUSES = ['DRAFT', 'OPEN', 'IN_REVIEW', 'CLOSED', 'ARCHIVED'] as const;

const STATUS_STYLE: Record<Row['status'], string> = {
  DRAFT: 'bg-slate-50 text-slate-700 ring-slate-200',
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  IN_REVIEW: 'bg-amber-50 text-amber-700 ring-amber-200',
  CLOSED: 'bg-slate-200/70 text-slate-700 ring-slate-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    featured?: string;
    cursor?: string;
  }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.status && STATUSES.includes(sp.status as (typeof STATUSES)[number])) {
    qs.set('status', sp.status);
  }
  if (sp.featured === 'true' || sp.featured === 'false') qs.set('featured', sp.featured);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/requests?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.requests.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.requests.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.requests.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.requests.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.requests.status.${s}` as 'admin.requests.status.DRAFT')}
            </option>
          ))}
        </select>
        <select
          name="featured"
          defaultValue={sp.featured ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.requests.filter.allFeatured')}</option>
          <option value="true">{t('admin.requests.filter.featuredYes')}</option>
          <option value="false">{t('admin.requests.filter.featuredNo')}</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.requests.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.title')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.company')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.featured')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.applications')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.tests')}</th>
              <th className="px-4 py-3 text-start">{t('admin.requests.col.createdAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.requests.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/requests/${r.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {r.title}
                    </Link>
                    <div className="font-mono text-[11px] text-slate-400">{r.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.company.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[r.status]}`}
                    >
                      {t(`admin.requests.status.${r.status}` as 'admin.requests.status.DRAFT')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {r.featured ? '★' : <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r._count.applications}</td>
                  <td className="px-4 py-3 text-slate-700">{r._count.tests}</td>
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
              pathname: `/${locale}/admin/requests`,
              query: { ...sp, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
          >
            {t('admin.requests.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
