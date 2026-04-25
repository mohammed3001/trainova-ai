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
import { SignDocumentClient } from './sign-client';

interface SignatureDetail {
  id: string;
  role: SignatureRole;
  signerId: string;
  status: SignatureStatus;
  signedName: string | null;
  intent: string | null;
  signatureHash: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
}

interface DocumentDetail {
  id: string;
  contractId: string;
  templateId: string | null;
  kind: ContractDocumentKind;
  title: string;
  bodyMarkdown: string;
  bodyHash: string;
  status: ContractDocumentStatus;
  hashValid: boolean;
  viewerRole: SignatureRole | null;
  expiresAt: string | null;
  signedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  signatures: SignatureDetail[];
}

const STATUS_BADGE: Record<ContractDocumentStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 ring-slate-200',
  AWAITING_SIGNATURES: 'bg-amber-50 text-amber-700 ring-amber-200',
  PARTIALLY_SIGNED: 'bg-sky-50 text-sky-700 ring-sky-200',
  FULLY_SIGNED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  EXPIRED: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default async function ContractDocumentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; docId: string }>;
}) {
  const { locale, id, docId } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) {
    redirect(`/${locale}/login?redirect=/${locale}/contracts/${id}/documents/${docId}`);
  }

  const [doc, t] = await Promise.all([
    authedFetch<DocumentDetail>(
      `/contract-documents/${encodeURIComponent(docId)}`,
    ).catch(() => null),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);
  if (!doc) redirect(`/${locale}/contracts/${id}/documents`);

  const myRow = doc.viewerRole
    ? doc.signatures.find((s) => s.role === doc.viewerRole)
    : undefined;
  const canSign =
    !!myRow &&
    myRow.status === 'PENDING' &&
    doc.status !== 'CANCELLED' &&
    doc.status !== 'EXPIRED' &&
    doc.hashValid;
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN';

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}/contracts/${id}/documents`}
        className="text-xs text-brand-600 hover:text-brand-700"
      >
        ← {t('list.back')}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-gradient-to-br from-brand-50 to-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
              {doc.kind}
            </span>
            <h1 className="text-2xl font-semibold text-slate-900">{doc.title}</h1>
          </div>
          <p className="text-xs text-slate-500">
            {t('detail.created')}: {new Date(doc.createdAt).toLocaleString(locale)}
            {doc.expiresAt && (
              <>
                {' · '}
                {t('detail.expires')}:{' '}
                {new Date(doc.expiresAt).toLocaleString(locale)}
              </>
            )}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_BADGE[doc.status]}`}
        >
          {t(`status.${doc.status}` as 'status.DRAFT')}
        </span>
      </header>

      {!doc.hashValid && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 shadow-sm"
        >
          <strong>{t('detail.tamperTitle')}:</strong> {t('detail.tamperBody')}
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <article className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('detail.body')}
          </h2>
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-slate-800">
            {doc.bodyMarkdown}
          </pre>
          <div className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
            <strong>SHA-256:</strong>{' '}
            <code className="break-all font-mono">{doc.bodyHash}</code>
          </div>
        </article>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('detail.signers')}
            </h2>
            <ul className="mt-3 space-y-3">
              {doc.signatures.map((s) => (
                <li
                  key={s.role}
                  className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      {t(`role.${s.role}` as 'role.COMPANY')}
                    </span>
                    <span
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ring-1 ring-inset ${
                        s.status === 'SIGNED'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : s.status === 'DECLINED'
                            ? 'bg-rose-50 text-rose-700 ring-rose-200'
                            : 'bg-slate-50 text-slate-600 ring-slate-200'
                      }`}
                    >
                      {t(`signature.${s.status}` as 'signature.PENDING')}
                    </span>
                  </div>
                  {s.signedAt && (
                    <div className="mt-2 text-xs text-slate-500">
                      {t('detail.signedAt')}:{' '}
                      {new Date(s.signedAt).toLocaleString(locale)}
                    </div>
                  )}
                  {s.declinedAt && s.declineReason && (
                    <div className="mt-2 text-xs text-rose-700">
                      {t('detail.declined')}: {s.declineReason}
                    </div>
                  )}
                  {s.signedName && (
                    <div className="mt-2 text-xs text-slate-700">
                      <strong>{t('detail.signedBy')}:</strong> {s.signedName}
                    </div>
                  )}
                  {s.intent && (
                    <div className="mt-1 text-xs italic text-slate-600">
                      “{s.intent}”
                    </div>
                  )}
                  {(isAdmin && (s.ipAddress || s.userAgent)) && (
                    <details className="mt-2 text-xs text-slate-500">
                      <summary className="cursor-pointer">
                        {t('detail.audit')}
                      </summary>
                      <div className="mt-1 space-y-0.5">
                        {s.ipAddress && (
                          <div>
                            IP: <code>{s.ipAddress}</code>
                          </div>
                        )}
                        {s.userAgent && (
                          <div className="break-all">UA: {s.userAgent}</div>
                        )}
                        {s.signatureHash && (
                          <div className="break-all">
                            Sig: <code>{s.signatureHash.slice(0, 16)}…</code>
                          </div>
                        )}
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {canSign && myRow && (
            <SignDocumentClient
              locale={locale}
              contractId={id}
              documentId={doc.id}
              role={myRow.role}
            />
          )}
        </aside>
      </section>
    </div>
  );
}
