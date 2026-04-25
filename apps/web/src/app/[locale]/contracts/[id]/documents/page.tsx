import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type {
  ContractDocumentKind,
  ContractDocumentStatus,
  SignatureRole,
  SignatureStatus,
} from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';

interface SignatureRow {
  role: SignatureRole;
  status: SignatureStatus;
  signedAt: string | null;
  declinedAt: string | null;
}

interface DocumentRow {
  id: string;
  kind: ContractDocumentKind;
  title: string;
  status: ContractDocumentStatus;
  createdAt: string;
  signedAt: string | null;
  expiresAt: string | null;
  signatures: SignatureRow[];
}

const STATUS_BADGE: Record<ContractDocumentStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  AWAITING_SIGNATURES: 'bg-amber-50 text-amber-700 ring-amber-200',
  PARTIALLY_SIGNED: 'bg-sky-50 text-sky-700 ring-sky-200',
  FULLY_SIGNED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function ContractDocumentsListPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/contracts/${id}/documents`);
  const [documents, t] = await Promise.all([
    authedFetch<DocumentRow[]>(
      `/contract-documents?contractId=${encodeURIComponent(id)}`,
    ).catch(() => [] as DocumentRow[]),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);

  const canAuthor = role === 'COMPANY_OWNER' || role === 'SUPER_ADMIN' || role === 'ADMIN';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{t('list.title')}</h1>
          <p className="text-sm text-slate-500">{t('list.subtitle')}</p>
        </div>
        {canAuthor && (
          <Link
            href={`/${locale}/contracts/${id}/documents/new`}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            {t('list.generate')}
          </Link>
        )}
      </header>

      <div className="space-y-3">
        {documents.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm text-slate-500">
            {t('list.empty')}
          </div>
        )}
        {documents.map((doc) => (
          <Link
            key={doc.id}
            href={`/${locale}/contracts/${id}/documents/${doc.id}`}
            className="group flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur transition hover:border-brand-300 hover:shadow-md"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
                  {doc.kind}
                </span>
                <h2 className="text-base font-semibold text-slate-900 group-hover:text-brand-700">
                  {doc.title}
                </h2>
              </div>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[doc.status]}`}
              >
                {t(`status.${doc.status}` as 'status.DRAFT')}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              {doc.signatures.map((s) => (
                <span
                  key={s.role}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ring-1 ring-inset ${
                    s.status === 'SIGNED'
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : s.status === 'DECLINED'
                        ? 'bg-rose-50 text-rose-700 ring-rose-200'
                        : 'bg-slate-50 text-slate-600 ring-slate-200'
                  }`}
                >
                  {t(`role.${s.role}` as 'role.COMPANY')} ·{' '}
                  {t(`signature.${s.status}` as 'signature.PENDING')}
                </span>
              ))}
              <span>
                {t('list.created')}: {new Date(doc.createdAt).toLocaleString(locale)}
              </span>
              {doc.expiresAt && (
                <span>
                  {t('list.expires')}:{' '}
                  {new Date(doc.expiresAt).toLocaleDateString(locale)}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
