import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

interface Participant {
  userId: string;
  user: { id: string; name: string; email: string; role: string };
}

interface Row {
  id: string;
  lockedAt: string | null;
  lockReason: string | null;
  createdAt: string;
  updatedAt: string;
  request: { id: string; slug: string; title: string } | null;
  participants: Participant[];
  _count: { messages: number };
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

export default async function AdminConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locked?: string; cursor?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.locked === 'true') qs.set('lockedOnly', 'true');
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/conversations?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.conversations.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.conversations.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.conversations.searchPlaceholder')}
          className="min-w-[240px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="locked"
          defaultValue={sp.locked ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.conversations.filter.lockedAll')}</option>
          <option value="true">{t('admin.conversations.filter.lockedOnly')}</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.conversations.filter.apply')}
        </button>
      </form>

      <ul className="space-y-3">
        {page.items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-sm text-slate-500">
            {t('admin.conversations.empty')}
          </li>
        ) : (
          page.items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/${locale}/admin/conversations/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {c.lockedAt ? (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                        {t('admin.conversations.lockedBadge')}
                      </span>
                    ) : null}
                    {c.request ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                        {c.request.title}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {c.participants.map((p) => p.user.name).join(' · ')}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {c.participants.map((p) => p.user.email).join(' · ')}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  <span>
                    {c._count.messages} {t('admin.conversations.col.messages')}
                  </span>
                  <span>{new Date(c.updatedAt).toLocaleDateString()}</span>
                </div>
              </Link>
            </li>
          ))
        )}
      </ul>

      {page.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={{
              pathname: `/${locale}/admin/conversations`,
              query: { ...sp, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white"
          >
            {t('admin.conversations.loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
