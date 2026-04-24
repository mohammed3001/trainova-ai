import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  slug: string;
  locale: string;
  title: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string;
  category: { id: string; nameEn: string; nameAr: string } | null;
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

interface Category {
  id: string;
  nameEn: string;
  nameAr: string;
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    locale?: string;
    status?: string;
    categoryId?: string;
    cursor?: string;
  }>;
}

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const LOCALES = ['en', 'ar'] as const;

export default async function AdminCmsArticlesPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.locale) qs.set('locale', sp.locale);
  if (sp.status) qs.set('status', sp.status);
  if (sp.categoryId) qs.set('categoryId', sp.categoryId);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const [page, categories] = await Promise.all([
    authedFetch<Page>(`/admin/cms/articles?${qs.toString()}`),
    authedFetch<Category[]>(`/admin/cms/categories`),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.articles.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.cms.articles.subtitle')}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/cms/articles/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.cms.articles.new')}
        </Link>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.cms.filter.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="locale"
          defaultValue={sp.locale ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.cms.filter.allLocales')}</option>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {l.toUpperCase()}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.cms.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.cms.articleStatus.${s}` as 'admin.cms.articleStatus.DRAFT')}
            </option>
          ))}
        </select>
        <select
          name="categoryId"
          defaultValue={sp.categoryId ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.cms.articles.filter.allCategories')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn} · {c.nameAr}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.cms.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.title')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.slug')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.locale')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.category')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.status')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.articles.col.updated')}
              </th>
              <th className="px-4 py-3 text-end">
                {t('admin.cms.articles.col.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.cms.articles.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3 font-medium text-slate-900">{r.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">/{r.slug}</td>
                  <td className="px-4 py-3 uppercase text-slate-600">{r.locale}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.category
                      ? locale === 'ar'
                        ? r.category.nameAr
                        : r.category.nameEn
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        r.status === 'PUBLISHED'
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800'
                          : r.status === 'ARCHIVED'
                            ? 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700'
                      }
                    >
                      {t(
                        `admin.cms.articleStatus.${r.status}` as 'admin.cms.articleStatus.DRAFT',
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(r.updatedAt).toLocaleDateString(locale)}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/cms/articles/${r.id}`}
                      className="text-sm font-medium text-brand-700 hover:underline"
                    >
                      {t('admin.cms.articles.edit')}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-2xl border border-white/60 bg-white/60 p-3 text-sm text-slate-600 shadow-sm backdrop-blur-md">
        <summary className="cursor-pointer select-none font-semibold">
          {t('admin.jsonAccordion')}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">
          {JSON.stringify(page, null, 2)}
        </pre>
      </details>
    </div>
  );
}
