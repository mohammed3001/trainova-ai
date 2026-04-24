import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ActionButton } from '@/components/admin/action-button';
import { reviewVerificationAction } from '@/lib/admin-actions';

interface DocumentEntry {
  objectKey: string;
  title: string;
  mimeType: string;
  sizeBytes?: number;
}

interface VerificationDetail {
  id: string;
  targetType: 'COMPANY' | 'TRAINER';
  targetId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  documents: unknown;
  notes: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  submitter: { id: string; email: string; name: string; role: string };
  reviewer: { id: string; email: string; name: string } | null;
  target:
    | { kind: 'COMPANY'; id: string; name: string; slug: string; verified: boolean }
    | { kind: 'TRAINER'; id: string; slug: string; headline: string | null; verified: boolean }
    | null;
}

const STATUS_STYLES: Record<VerificationDetail['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
};

export default async function AdminVerificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let row: VerificationDetail;
  try {
    row = await authedFetch<VerificationDetail>(`/admin/verification/${id}`);
  } catch {
    notFound();
  }

  const docs: DocumentEntry[] = Array.isArray(row.documents) ? (row.documents as DocumentEntry[]) : [];
  const targetHref =
    row.target?.kind === 'COMPANY'
      ? `/${locale}/admin/companies/${row.target.id}`
      : row.target?.kind === 'TRAINER'
        ? `/${locale}/admin/trainers/${row.target.id}`
        : null;
  const targetName =
    row.target?.kind === 'COMPANY'
      ? row.target.name
      : row.target?.kind === 'TRAINER'
        ? (row.target.headline ?? row.target.slug)
        : t('admin.verification.targetDeleted');

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/verification`} className="hover:text-brand-700">
          ← {t('admin.verification.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {t(`admin.verification.targetType.${row.targetType}` as 'admin.verification.targetType.COMPANY')}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[row.status]}`}>
              {t(`admin.verification.status.${row.status}` as 'admin.verification.status.PENDING')}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{targetName}</h1>
          {targetHref && (
            <Link href={targetHref} className="mt-1 inline-block text-sm text-brand-700 hover:underline">
              {t('admin.verification.viewTarget')} →
            </Link>
          )}
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.users.col.created')}:</dt>{' '}
            <dd className="inline text-slate-700">{new Date(row.createdAt).toLocaleString()}</dd>
          </div>
          {row.reviewedAt && (
            <div>
              <dt className="inline">{t('admin.verification.col.reviewedAt')}:</dt>{' '}
              <dd className="inline text-slate-700">{new Date(row.reviewedAt).toLocaleString()}</dd>
            </div>
          )}
          {row.reviewer && (
            <div>
              <dt className="inline">{t('admin.verification.col.reviewer')}:</dt>{' '}
              <dd className="inline text-slate-700">{row.reviewer.name}</dd>
            </div>
          )}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.verification.section.submitter')}
          </h2>
          <Link
            href={`/${locale}/admin/users/${row.submitter.id}`}
            className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/50"
          >
            <div>
              <div className="font-semibold text-slate-900">{row.submitter.name}</div>
              <div className="font-mono text-xs text-slate-500">{row.submitter.email}</div>
              <div className="mt-1 text-xs text-slate-500">
                {t(`admin.userRole.${row.submitter.role}` as 'admin.userRole.TRAINER')}
              </div>
            </div>
            <span className="text-slate-400">→</span>
          </Link>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.verification.section.documents')} ({docs.length})
          </h2>
          {docs.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">{t('admin.verification.noDocuments')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {docs.map((d, i) => (
                <li
                  key={`${d.objectKey}-${i}`}
                  className="rounded-lg border border-slate-200 bg-white/60 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900">{d.title}</span>
                    <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                      {d.mimeType}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-xs text-slate-500">{d.objectKey}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {row.notes && (
          <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.verification.section.notes')}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{row.notes}</p>
          </section>
        )}

        {row.rejectionReason && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50/80 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-rose-700">
              {t('admin.verification.section.rejectionReason')}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-rose-900">
              {row.rejectionReason}
            </p>
          </section>
        )}

        {row.status === 'PENDING' && (
          <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.verification.section.review')}
            </h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <form action={reviewVerificationAction} className="space-y-2">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="decision" value="APPROVE" />
                <p className="text-sm text-slate-600">{t('admin.verification.approveHint')}</p>
                <ActionButton variant="success" confirm={t('admin.verification.confirm.approve')}>
                  {t('admin.verification.action.approve')}
                </ActionButton>
              </form>
              <form action={reviewVerificationAction} className="space-y-2">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="decision" value="REJECT" />
                <label className="block text-sm font-medium text-slate-700">
                  {t('admin.verification.rejectionReasonLabel')}
                  <textarea
                    name="rejectionReason"
                    required
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                  />
                </label>
                <ActionButton variant="danger" confirm={t('admin.verification.confirm.reject')}>
                  {t('admin.verification.action.reject')}
                </ActionButton>
              </form>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
