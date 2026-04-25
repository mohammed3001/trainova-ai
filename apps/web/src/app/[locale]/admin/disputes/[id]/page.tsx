import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { DisputeListItem } from '@trainova/shared';
import { ADMIN_ROLE_GROUPS } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { DisputeStatusBadgeServer } from '@/components/disputes/dispute-status-badge';
import { DisputeResolveForm } from '@/components/disputes/dispute-resolve-form';

export const dynamic = 'force-dynamic';

export default async function AdminDisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const locale = await getLocale();
  const { id } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/disputes/${id}`);
  if (!(ADMIN_ROLE_GROUPS.MODERATION as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}/dashboard`);
  }
  const dispute = await authedFetch<DisputeListItem>(
    `/admin/disputes/${encodeURIComponent(id)}`,
  ).catch(() => null);
  if (!dispute) notFound();

  const t = await getTranslations({ locale, namespace: 'disputes.detail' });
  const tAdmin = await getTranslations({ locale, namespace: 'disputes.admin' });
  const tReason = await getTranslations({ locale, namespace: 'disputes.raise.reasons' });
  const tRole = await getTranslations({ locale, namespace: 'disputes.role' });
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const isActive = dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW';

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <Link
          href={`/${locale}/admin/disputes`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {tAdmin('title')}
        </Link>
      </div>

      <header className="card space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
              {dispute.contract.title}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {dispute.contract.companyName} ↔ {dispute.contract.trainerName}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('raisedBy', {
                name: dispute.raisedBy.displayName,
                role: tRole(dispute.raisedByRole),
              })}{' '}
              · {dateFmt.format(new Date(dispute.raisedAt))}
            </p>
          </div>
          <DisputeStatusBadgeServer status={dispute.status} locale={locale} />
        </div>
      </header>

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('reason')}</h2>
        <p className="text-sm text-slate-700 dark:text-slate-300">{tReason(dispute.reason)}</p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('description')}
        </h2>
        <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
          {dispute.description}
        </p>
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('evidence')}</h2>
        {dispute.evidence?.links?.length ? (
          <ul className="space-y-1 text-sm">
            {dispute.evidence.links.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:text-brand-700"
                  dir="ltr"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('noEvidence')}</p>
        )}
      </section>

      <section className="card space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('resolution')}
        </h2>
        {dispute.resolution ? (
          <>
            <p className="whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
              {dispute.resolution}
            </p>
            {dispute.resolvedAt ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {dateFmt.format(new Date(dispute.resolvedAt))}
                {dispute.resolver ? ` · ${dispute.resolver.displayName}` : null}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('noResolution')}</p>
        )}
      </section>

      {isActive ? (
        <section className="card">
          <DisputeResolveForm disputeId={dispute.id} currentStatus={dispute.status} />
        </section>
      ) : null}
    </div>
  );
}
