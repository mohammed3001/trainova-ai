import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { deleteFaqAction } from '@/lib/cms-actions';
import { locales as LOCALES } from '@/i18n/config';

interface Row {
  id: string;
  locale: string;
  section: string;
  question: string;
  answer: string;
  order: number;
  published: boolean;
  updatedAt: string;
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

interface PageProps {
  searchParams: Promise<{
    locale?: string;
    section?: string;
    published?: string;
    cursor?: string;
  }>;
}

const SECTIONS = [
  'GENERAL',
  'COMPANIES',
  'TRAINERS',
  'PAYMENTS',
  'TESTS',
  'MODELS',
  'ACCOUNT',
] as const;

export default async function AdminCmsFaqsPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.locale) qs.set('locale', sp.locale);
  if (sp.section) qs.set('section', sp.section);
  if (sp.published === 'true' || sp.published === 'false') {
    qs.set('published', sp.published);
  }
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '100');
  const page = await authedFetch<Page>(`/admin/cms/faqs?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.faqs.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.cms.faqs.subtitle')}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/cms/faqs/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.cms.faqs.new')}
        </Link>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
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
          name="section"
          defaultValue={sp.section ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.cms.faqs.filter.allSections')}</option>
          {SECTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`admin.cms.faqs.section.${s}` as 'admin.cms.faqs.section.GENERAL')}
            </option>
          ))}
        </select>
        <select
          name="published"
          defaultValue={sp.published ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.cms.faqs.filter.anyPublished')}</option>
          <option value="true">{t('admin.cms.faqs.filter.published')}</option>
          <option value="false">{t('admin.cms.faqs.filter.unpublished')}</option>
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
                {t('admin.cms.faqs.col.question')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.faqs.col.section')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.faqs.col.locale')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.faqs.col.order')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.faqs.col.published')}
              </th>
              <th className="px-4 py-3 text-end">
                {t('admin.cms.pages.col.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {page.items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  {t('admin.cms.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((r) => (
                <tr key={r.id} className="bg-white/40 hover:bg-white/70">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <span dir={r.locale === 'ar' ? 'rtl' : 'ltr'}>
                      {r.question}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t(
                      `admin.cms.faqs.section.${r.section}` as 'admin.cms.faqs.section.GENERAL',
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs uppercase text-slate-500">
                    {r.locale}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.order}</td>
                  <td className="px-4 py-3">
                    {r.published ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {t('admin.cms.faqs.filter.published')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {t('admin.cms.faqs.filter.unpublished')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/${locale}/admin/cms/faqs/${r.id}`}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {t('admin.cms.edit')}
                      </Link>
                      <form action={deleteFaqAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          {t('admin.cms.delete')}
                        </button>
                      </form>
                    </div>
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
            href={`?${buildCursorQs(sp, page.nextCursor)}`}
            className="rounded-lg border border-white/60 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-md transition hover:bg-white"
          >
            {t('admin.cms.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function buildCursorQs(
  sp: { locale?: string; section?: string; published?: string },
  cursor: string,
) {
  const qs = new URLSearchParams();
  if (sp.locale) qs.set('locale', sp.locale);
  if (sp.section) qs.set('section', sp.section);
  if (sp.published) qs.set('published', sp.published);
  qs.set('cursor', cursor);
  return qs.toString();
}
