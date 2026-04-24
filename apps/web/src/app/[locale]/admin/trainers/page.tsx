import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { VerifiedBadge } from '@/components/admin/verified-badge';

interface Row {
  id: string;
  slug: string;
  headline: string | null;
  country: string | null;
  verified: boolean;
  createdAt: string;
  user: { id: string; email: string; name: string; status: string; _count: { applications: number } };
  skills: { skill: { id: string; slug: string; nameEn: string; nameAr: string } }[];
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

export default async function AdminTrainersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; verified?: string; cursor?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.verified === 'true' || sp.verified === 'false') qs.set('verified', sp.verified);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/trainers?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.trainers.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.trainers.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.trainers.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="verified"
          defaultValue={sp.verified ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.companies.filter.all')}</option>
          <option value="true">{t('admin.companies.filter.verified')}</option>
          <option value="false">{t('admin.companies.filter.unverified')}</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          {t('admin.users.filter.apply')}
        </button>
      </form>

      <ul className="grid gap-3 sm:grid-cols-2">
        {page.items.length === 0 ? (
          <li className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-sm text-slate-500">
            {t('admin.trainers.empty')}
          </li>
        ) : (
          page.items.map((r) => (
            <li key={r.id}>
              <Link
                href={`/${locale}/admin/trainers/${r.id}`}
                className="group flex items-start justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-semibold text-slate-900">{r.user.name}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {r.headline ?? r.slug}
                    {r.country ? ` · ${r.country}` : ''}
                  </div>
                  {r.skills.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.skills.slice(0, 5).map((s) => (
                        <span
                          key={s.skill.id}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700"
                        >
                          {locale === 'ar' ? s.skill.nameAr : s.skill.nameEn}
                        </span>
                      ))}
                      {r.skills.length > 5 && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          +{r.skills.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <VerifiedBadge
                  verified={r.verified}
                  labelVerified={t('admin.common.verified')}
                  labelUnverified={t('admin.common.unverified')}
                />
              </Link>
            </li>
          ))
        )}
      </ul>

      {page.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{ pathname: `/${locale}/admin/trainers`, query: { ...sp, cursor: page.nextCursor } }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {t('admin.users.loadMore')}
          </Link>
        </div>
      )}
    </div>
  );
}
