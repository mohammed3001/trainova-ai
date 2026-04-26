import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getToken } from '@/lib/session';
import { StartKycForm } from './start-form';

type Status = 'PENDING' | 'AWAITING_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface KycMine {
  kycVerifiedAt: string | null;
  session: {
    id: string;
    status: Status;
    provider: string;
    documentType: string | null;
    documentCountry: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
    decisionReason: string | null;
    expiresAt: string | null;
    createdAt: string;
  } | null;
}

const STATUS_STYLES: Record<Status, string> = {
  PENDING: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  AWAITING_REVIEW: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
  EXPIRED: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
};

export default async function SettingsKycPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const token = await getToken();
  if (!token) redirect(`/${locale}/login?next=/${locale}/settings/kyc`);

  const data = await authedFetch<KycMine>('/kyc/me');
  const verified = !!data.kycVerifiedAt;
  const session = data.session;
  // After an admin revokes via revokeVerification, kycVerifiedAt is cleared but
  // the latest session row stays APPROVED (preserves audit trail). The backend
  // startOrResume only blocks on PENDING/AWAITING_REVIEW, so the form must be
  // visible whenever the user is not currently verified and there's no active
  // session — APPROVED-but-revoked included.
  const canStart =
    !verified &&
    (!session ||
      session.status === 'REJECTED' ||
      session.status === 'EXPIRED' ||
      session.status === 'APPROVED');

  return (
    <div className="space-y-6">
      <header>
        <Link href={`/${locale}/settings`} className="text-sm text-slate-500 hover:text-brand-700">
          ← {t('preferences.title')}
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{t('settings.kyc.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('settings.kyc.subtitle')}</p>
      </header>

      {verified ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">
              {t('settings.kyc.verifiedBadge')}
            </span>
            <span className="text-sm text-emerald-900">
              {t('settings.kyc.verifiedAt', {
                at: new Date(data.kycVerifiedAt!).toLocaleDateString(locale),
              })}
            </span>
          </div>
          <p className="mt-3 text-sm text-emerald-900/90">{t('settings.kyc.verifiedHint')}</p>
        </section>
      ) : null}

      {session ? (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('settings.kyc.sessionTitle')}
            </h2>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[session.status]}`}>
              {t(`admin.kyc.status.${session.status}` as 'admin.kyc.status.PENDING')}
            </span>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">{t('admin.kyc.field.documentType')}</dt>
              <dd className="text-slate-900">{session.documentType ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('admin.kyc.field.documentCountry')}</dt>
              <dd className="text-slate-900">{session.documentCountry ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('admin.kyc.col.submittedAt')}</dt>
              <dd className="text-slate-900">
                {session.submittedAt ? new Date(session.submittedAt).toLocaleString(locale) : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t('admin.kyc.col.reviewedAt')}</dt>
              <dd className="text-slate-900">
                {session.reviewedAt ? new Date(session.reviewedAt).toLocaleString(locale) : '—'}
              </dd>
            </div>
          </dl>
          {session.decisionReason ? (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-sm text-rose-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                {t('admin.kyc.field.decisionReason')}
              </div>
              <div className="mt-1">{session.decisionReason}</div>
            </div>
          ) : null}
          {session.status === 'PENDING' ? (
            <p className="mt-3 text-xs text-slate-500">{t('settings.kyc.pendingHint')}</p>
          ) : null}
          {session.status === 'AWAITING_REVIEW' ? (
            <p className="mt-3 text-xs text-slate-500">{t('settings.kyc.awaitingHint')}</p>
          ) : null}
        </section>
      ) : null}

      {canStart ? (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('settings.kyc.start.title')}
          </h2>
          <p className="mt-2 text-sm text-slate-600">{t('settings.kyc.start.body')}</p>
          <StartKycForm
            labels={{
              documentType: t('settings.kyc.start.documentType'),
              documentCountry: t('settings.kyc.start.documentCountry'),
              passport: t('settings.kyc.start.passport'),
              nationalId: t('settings.kyc.start.nationalId'),
              driverLicense: t('settings.kyc.start.driverLicense'),
              submit: t('settings.kyc.start.submit'),
              error: t('settings.kyc.start.error'),
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
