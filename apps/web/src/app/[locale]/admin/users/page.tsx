import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { StatusPill } from '@/components/admin/status-pill';

interface Row {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  locale: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

interface PageProps {
  searchParams: Promise<{ q?: string; role?: string; status?: string; cursor?: string }>;
}

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'COMPANY_OWNER', 'COMPANY_MEMBER', 'TRAINER'] as const;
const STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const;

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.role) qs.set('role', sp.role);
  if (sp.status) qs.set('status', sp.status);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/users?${qs.toString()}`);

  const statusLabels = {
    active: t('admin.userStatus.ACTIVE'),
    suspended: t('admin.userStatus.SUSPENDED'),
    pending: t('admin.userStatus.PENDING'),
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.users.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.users.subtitle')}</p>
        </div>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <input
          name="q"
          type="search"
          defaultValue={sp.q ?? ''}
          placeholder={t('admin.users.searchPlaceholder')}
          className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
        <select
          name="role"
          defaultValue={sp.role ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.users.filter.allRoles')}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`admin.userRole.${r}` as 'admin.userRole.SUPER_ADMIN')}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.users.filter.allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.userStatus.${s}` as 'admin.userStatus.ACTIVE')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.users.filter.apply')}
        </button>
      </form>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.users.col.name')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.col.email')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.col.role')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.col.verified')}</th>
              <th className="px-4 py-3 text-start">{t('admin.users.col.created')}</th>
              <th className="px-4 py-3 text-end">{t('admin.users.col.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('admin.users.empty')}
                </td>
              </tr>
            ) : (
              page.items.map((u) => (
                <tr key={u.id} className="transition hover:bg-brand-50/40">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      {t(`admin.userRole.${u.role}` as 'admin.userRole.SUPER_ADMIN')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.status} labels={statusLabels} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.emailVerifiedAt ? t('admin.users.emailVerified') : t('admin.users.emailUnverified')}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link
                      href={`/${locale}/admin/users/${u.id}`}
                      className="text-sm font-semibold text-brand-700 hover:text-brand-900"
                    >
                      {t('admin.users.open')}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {page.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/admin/users`,
              query: { ...sp, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-white"
          >
            {t('admin.users.loadMore')}
          </Link>
        </div>
      )}
    </div>
  );
}
