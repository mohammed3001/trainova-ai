import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { reviewKycAction, revokeKycAction } from '@/lib/admin-actions';
import { ActionButton } from '@/components/admin/action-button';

type Status = 'PENDING' | 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface KycDocument {
  key: string;
  side: 'FRONT' | 'BACK' | 'SELFIE';
  contentType?: string;
  uploadedAt?: string;
}

interface KycDetail {
  id: string;
  status: Status;
  provider: 'STUB' | 'ONFIDO' | 'PERSONA' | 'STRIPE_IDENTITY';
  providerSessionId: string | null;
  documentType: string | null;
  documentCountry: string | null;
  documents: unknown;
  metadata: unknown;
  decisionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerifiedAt: string | null;
    kycVerifiedAt: string | null;
  };
  reviewer: { id: string; name: string; email: string } | null;
}

const STATUS_STYLES: Record<Status, string> = {
  PENDING: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  AWAITING_REVIEW: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  EXPIRED: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
};

export default async function AdminKycDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let row: KycDetail;
  try {
    row = await authedFetch<KycDetail>(`/admin/kyc/sessions/${id}`);
  } catch {
    notFound();
  }

  const documents: KycDocument[] = Array.isArray(row.documents) ? (row.documents as KycDocument[]) : [];

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/kyc`} className="hover:text-brand-700">
          ← {t('admin.kyc.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[row.status]}`}>
              {t(`admin.kyc.status.${row.status}` as 'admin.kyc.status.PENDING')}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
              {row.provider}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{row.user.name}</h1>
          <Link
            href={`/${locale}/admin/users/${row.user.id}`}
            className="mt-1 inline-block text-sm text-brand-700 hover:underline"
          >
            {row.user.email} →
          </Link>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.users.col.created')}:</dt>{' '}
            <dd className="inline text-slate-700">{new Date(row.createdAt).toLocaleString(locale)}</dd>
          </div>
          {row.submittedAt ? (
            <div>
              <dt className="inline">{t('admin.kyc.col.submittedAt')}:</dt>{' '}
              <dd className="inline text-slate-700">{new Date(row.submittedAt).toLocaleString(locale)}</dd>
            </div>
          ) : null}
          {row.reviewedAt ? (
            <div>
              <dt className="inline">{t('admin.kyc.col.reviewedAt')}:</dt>{' '}
              <dd className="inline text-slate-700">{new Date(row.reviewedAt).toLocaleString(locale)}</dd>
            </div>
          ) : null}
          {row.reviewer ? (
            <div>
              <dt className="inline">{t('admin.kyc.col.reviewer')}:</dt>{' '}
              <dd className="inline text-slate-700">{row.reviewer.name}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.kyc.section.subject')}
          </h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.email')}</dt>
              <dd className="text-slate-900">{row.user.email}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.emailVerified')}</dt>
              <dd className="text-slate-900">
                {row.user.emailVerifiedAt ? new Date(row.user.emailVerifiedAt).toLocaleDateString(locale) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.kycVerified')}</dt>
              <dd className="text-slate-900">
                {row.user.kycVerifiedAt ? new Date(row.user.kycVerifiedAt).toLocaleDateString(locale) : '—'}
              </dd>
            </div>
          </dl>
          {row.user.kycVerifiedAt ? (
            <form action={revokeKycAction} className="mt-4 space-y-2 border-t border-slate-200 pt-3">
              <input type="hidden" name="userId" value={row.user.id} />
              <label className="block text-xs font-semibold text-slate-600">
                {t('admin.kyc.revoke.reasonLabel')}
              </label>
              <textarea
                name="reason"
                rows={2}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              />
              <ActionButton variant="danger" className="w-full">
                {t('admin.kyc.revoke.button')}
              </ActionButton>
            </form>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.kyc.section.session')}
          </h2>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.documentType')}</dt>
              <dd className="text-slate-900">{row.documentType ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.documentCountry')}</dt>
              <dd className="text-slate-900">{row.documentCountry ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t('admin.kyc.field.providerSessionId')}</dt>
              <dd className="font-mono text-xs text-slate-900">{row.providerSessionId ?? '—'}</dd>
            </div>
            {row.expiresAt ? (
              <div className="flex justify-between">
                <dt className="text-slate-500">{t('admin.kyc.field.expiresAt')}</dt>
                <dd className="text-slate-900">{new Date(row.expiresAt).toLocaleString(locale)}</dd>
              </div>
            ) : null}
            {row.decisionReason ? (
              <div>
                <dt className="text-slate-500">{t('admin.kyc.field.decisionReason')}</dt>
                <dd className="mt-1 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900">{row.decisionReason}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.kyc.section.documents')}
        </h2>
        {documents.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('admin.kyc.noDocuments')}</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {documents.map((d) => (
              <li
                key={d.key}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">
                    {t(`admin.kyc.documentSide.${d.side}` as 'admin.kyc.documentSide.FRONT')}
                  </div>
                  <div className="truncate font-mono text-xs text-slate-500">{d.key}</div>
                </div>
                {d.contentType ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700">
                    {d.contentType}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {row.status === 'AWAITING_REVIEW' ? (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.kyc.section.review')}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <form action={reviewKycAction} className="space-y-2 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="decision" value="APPROVE" />
              <label className="block text-xs font-semibold text-slate-600">
                {t('admin.kyc.review.approveNoteLabel')}
              </label>
              <textarea
                name="decisionReason"
                rows={2}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              />
              <ActionButton variant="success" className="w-full">
                {t('admin.kyc.review.approve')}
              </ActionButton>
            </form>
            <form action={reviewKycAction} className="space-y-2 rounded-lg border border-rose-100 bg-rose-50/40 p-3">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="decision" value="REJECT" />
              <label className="block text-xs font-semibold text-slate-600">
                {t('admin.kyc.review.rejectReasonLabel')}
              </label>
              <textarea
                name="decisionReason"
                rows={2}
                required
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                placeholder={t('admin.kyc.review.reasonPlaceholder')}
              />
              <ActionButton variant="danger" className="w-full">
                {t('admin.kyc.review.reject')}
              </ActionButton>
            </form>
          </div>
          <p className="mt-2 text-xs text-slate-500">{t('admin.kyc.review.hint')}</p>
        </section>
      ) : null}
    </div>
  );
}
