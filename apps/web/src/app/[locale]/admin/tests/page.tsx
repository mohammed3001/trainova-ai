import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

type ScoringMode = 'AUTO' | 'MANUAL' | 'HYBRID';

interface Row {
  id: string;
  title: string;
  scoringMode: ScoringMode;
  passingScore: number;
  timeLimitMin: number | null;
  createdAt: string;
  request: {
    id: string;
    slug: string;
    title: string;
    company: { id: string; name: string; slug: string };
  };
  _count: { tasks: number; attempts: number };
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

const MODES: ScoringMode[] = ['AUTO', 'MANUAL', 'HYBRID'];

export default async function AdminTestsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    scoringMode?: string;
    requestId?: string;
    cursor?: string;
  }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.scoringMode && MODES.includes(sp.scoringMode as ScoringMode)) {
    qs.set('scoringMode', sp.scoringMode);
  }
  if (sp.requestId) qs.set('requestId', sp.requestId);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/tests?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.tests.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.tests.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.tests.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="scoringMode"
          defaultValue={sp.scoringMode ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.tests.filter.allScoringModes')}</option>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {t(`admin.tests.scoringMode.${m}` as 'admin.tests.scoringMode.AUTO')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.tests.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.title')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.request')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.company')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.scoringMode')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.passingScore')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.tasks')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.attempts')}</th>
              <th className="px-4 py-3 text-start">{t('admin.tests.col.createdAt')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.tests.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((r) => (
                <tr key={r.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3">
                    <Link
                      href={`/${locale}/admin/tests/${r.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {r.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <Link
                      href={`/${locale}/admin/requests/${r.request.id}`}
                      className="hover:text-brand-700"
                    >
                      {r.request.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.request.company.name}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {t(
                      `admin.tests.scoringMode.${r.scoringMode}` as 'admin.tests.scoringMode.AUTO',
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.passingScore}</td>
                  <td className="px-4 py-3 text-slate-700">{r._count.tasks}</td>
                  <td className="px-4 py-3 text-slate-700">{r._count.attempts}</td>
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
              pathname: `/${locale}/admin/tests`,
              query: { ...sp, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
          >
            {t('admin.tests.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
