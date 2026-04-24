import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  targetType: 'COMPANY' | 'TRAINER';
  targetId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  documents: unknown;
  notes: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  submitter: { id: string; email: string; name: string; role: string };
  reviewer: { id: string; email: string; name: string } | null;
}

interface Page {
  items: Row[];
  nextCursor: string | null;
}

const STATUS_STYLES: Record<Row['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

export default async function AdminVerificationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; targetType?: string; cursor?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const qs = new URLSearchParams();
  const status = sp.status && ['PENDING', 'APPROVED', 'REJECTED'].includes(sp.status) ? sp.status : 'PENDING';
  qs.set('status', status);
  if (sp.targetType && ['COMPANY', 'TRAINER'].includes(sp.targetType)) qs.set('targetType', sp.targetType);
  if (sp.cursor) qs.set('cursor', sp.cursor);
  qs.set('limit', '50');

  const page = await authedFetch<Page>(`/admin/verification?${qs.toString()}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.verification.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.verification.subtitle')}</p>
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
          <option value="PENDING">{t('admin.verification.status.PENDING')}</option>
          <option value="APPROVED">{t('admin.verification.status.APPROVED')}</option>
          <option value="REJECTED">{t('admin.verification.status.REJECTED')}</option>
        </select>
        <select
          name="targetType"
          defaultValue={sp.targetType ?? ''}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{t('admin.verification.targetType.ALL')}</option>
          <option value="COMPANY">{t('admin.verification.targetType.COMPANY')}</option>
          <option value="TRAINER">{t('admin.verification.targetType.TRAINER')}</option>
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
            {t('admin.verification.empty')}
          </li>
        ) : (
          page.items.map((v) => {
            const docs = Array.isArray(v.documents) ? (v.documents as unknown[]).length : 0;
            return (
              <li key={v.id}>
                <Link
                  href={`/${locale}/admin/verification/${v.id}`}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {t(`admin.verification.targetType.${v.targetType}` as 'admin.verification.targetType.COMPANY')}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[v.status]}`}>
                        {t(`admin.verification.status.${v.status}` as 'admin.verification.status.PENDING')}
                      </span>
                    </div>
                    <div className="mt-2 truncate text-sm font-semibold text-slate-900">
                      {v.submitter.name}
                    </div>
                    <div className="truncate font-mono text-xs text-slate-500">
                      {v.submitter.email}
                    </div>
                  </div>
                  <dl className="grid gap-0.5 text-end text-xs text-slate-500">
                    <div>
                      {t('admin.verification.col.documents')}: <span className="text-slate-700">{docs}</span>
                    </div>
                    <div>{new Date(v.createdAt).toLocaleDateString()}</div>
                    {v.reviewer && (
                      <div className="truncate">
                        {t('admin.verification.col.reviewer')}:{' '}
                        <span className="text-slate-700">{v.reviewer.name}</span>
                      </div>
                    )}
                  </dl>
                </Link>
              </li>
            );
          })
        )}
      </ul>

      {page.nextCursor && (
        <div className="flex justify-end">
          <Link
            href={{
              pathname: `/${locale}/admin/verification`,
              query: { ...sp, status, cursor: page.nextCursor },
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
