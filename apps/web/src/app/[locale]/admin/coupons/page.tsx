import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import {
  ADMIN_ROLE_GROUPS,
  CouponAppliesTos,
  CouponStatuses,
  type PublicCoupon,
} from '@trainova/shared';

interface ListResponse {
  items: PublicCoupon[];
  total: number;
  page: number;
  pageSize: number;
}

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    appliesTo?: string;
    page?: string;
  }>;
}

function formatAmountOff(c: PublicCoupon): string {
  if (c.kind === 'PERCENT') {
    return `${(c.amountOff / 100).toFixed(2).replace(/\.00$/, '')}%`;
  }
  const major = (c.amountOff / 100).toFixed(2);
  return `${major} ${c.currency ?? ''}`.trim();
}

function formatTotalDiscount(c: PublicCoupon): string {
  const major = (c.totalDiscountMinor / 100).toFixed(2);
  return `${major} ${c.currency ?? ''}`.trim();
}

export default async function AdminCouponsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.FINANCE as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.status) qs.set('status', sp.status);
  if (sp.appliesTo) qs.set('appliesTo', sp.appliesTo);
  if (sp.page) qs.set('page', sp.page);

  const data = await authedFetch<ListResponse>(
    `/admin/coupons${qs.toString() ? `?${qs}` : ''}`,
  );

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.coupons.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('admin.coupons.subtitle')}
          </p>
        </div>
        <Link className="btn-primary" href={`/${locale}/admin/coupons/new`}>
          {t('admin.coupons.new')}
        </Link>
      </header>

      <form
        className="card flex flex-wrap items-end gap-3 bg-white/70 backdrop-blur"
        action=""
        method="get"
      >
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.coupons.filter.search')}
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={t('admin.coupons.filter.searchPlaceholder')}
            className="input"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.coupons.filter.status')}
          <select name="status" defaultValue={sp.status ?? ''} className="input min-w-[140px]">
            <option value="">{t('admin.coupons.filter.all')}</option>
            {CouponStatuses.map((s) => (
              <option key={s} value={s}>
                {t(`admin.coupons.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.coupons.filter.appliesTo')}
          <select
            name="appliesTo"
            defaultValue={sp.appliesTo ?? ''}
            className="input min-w-[160px]"
          >
            <option value="">{t('admin.coupons.filter.all')}</option>
            {CouponAppliesTos.map((a) => (
              <option key={a} value={a}>
                {t(`admin.coupons.appliesTo.${a}`)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-primary">
          {t('admin.coupons.filter.apply')}
        </button>
      </form>

      <section className="card overflow-hidden bg-white/70 p-0 backdrop-blur">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.code')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.kind')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.amount')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.appliesTo')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.audience')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.redemptions')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.totalDiscount')}</th>
              <th className="px-4 py-3 text-start">{t('admin.coupons.col.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                  {c.code}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">
                    {t(`admin.coupons.kind.${c.kind}`)}
                  </span>
                </td>
                <td className="px-4 py-3 tabular-nums">{formatAmountOff(c)}</td>
                <td className="px-4 py-3">{t(`admin.coupons.appliesTo.${c.appliesTo}`)}</td>
                <td className="px-4 py-3">{t(`admin.coupons.audience.${c.audience}`)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {c.redeemedCount}
                  {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatTotalDiscount(c)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.status === 'ACTIVE'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {t(`admin.coupons.status.${c.status}`)}
                  </span>
                </td>
                <td className="px-4 py-3 text-end">
                  <Link
                    className="text-xs font-medium text-brand-600 hover:underline"
                    href={`/${locale}/admin/coupons/${c.id}`}
                  >
                    {t('admin.coupons.col.edit')}
                  </Link>
                </td>
              </tr>
            ))}
            {data.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">
                  {t('admin.coupons.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 text-sm">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            const params = new URLSearchParams(qs);
            params.set('page', String(p));
            const isActive = data.page === p;
            return (
              <Link
                key={p}
                href={`?${params.toString()}`}
                className={`rounded-lg px-3 py-1.5 ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
