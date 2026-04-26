import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

const STATUSES = ['PENDING', 'AWAITING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
type Status = (typeof STATUSES)[number];

interface Row {
  id: string;
  status: Status;
  provider: 'STUB' | 'ONFIDO' | 'PERSONA' | 'STRIPE_IDENTITY';
  documentType: string | null;
  documentCountry: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerifiedAt: string | null;
    kycVerifiedAt: string | null;
  };
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

const STATUS_STYLES: Record<Status, string> = {
  PENDING: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  AWAITING_REVIEW: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  EXPIRED: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
};

export default async function AdminKycQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; cursor?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  const status =
    sp.status && (STATUSES as readonly string[]).includes(sp.status) ? (sp.status as Status) : 'AWAITING_REVIEW';
  qs.set('status', status);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/kyc/sessions?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.kyc.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.kyc.subtitle')}</p>
      </header>

      <form
        method="get"
        className="flex flex-wrap gap-2 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md"
      >
        <select
          name="status"
          defaultValue={status}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`admin.kyc.status.${s}` as 'admin.kyc.status.PENDING')}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          {t('admin.users.filter.apply')}
        </button>
      </form>

      <ul className="space-y-3">
        {page.items.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-sm text-slate-500">
            {t('admin.kyc.empty')}
          </li>
        ) : (
          page.items.map((s) => (
            <li key={s.id}>
              <Link
                href={`/${locale}/admin/kyc/${s.id}`}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[s.status]}`}>
                      {t(`admin.kyc.status.${s.status}` as 'admin.kyc.status.PENDING')}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                      {s.provider}
                    </span>
                    {s.user.kycVerifiedAt ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                        {t('admin.kyc.alreadyVerified')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 truncate text-sm font-semibold text-slate-900">{s.user.name}</div>
                  <div className="truncate text-xs text-slate-500">{s.user.email}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {s.documentType ?? '—'}
                    {s.documentCountry ? ` · ${s.documentCountry}` : ''}
                  </div>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {s.submittedAt
                    ? new Date(s.submittedAt).toLocaleString(locale)
                    : new Date(s.createdAt).toLocaleString(locale)}
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
              pathname: `/${locale}/admin/kyc`,
              query: { status, cursor: page.nextCursor },
            }}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {t('admin.users.pagination.next')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
