'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { InvitationPreviewDto } from '@trainova/shared';
import { acceptInvitation } from '@/lib/team-api';

interface Props {
  preview: InvitationPreviewDto;
  token: string;
}

export function AcceptInvitationClient({ preview, token }: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const accept = () => {
    setError(null);
    startTransition(async () => {
      try {
        await acceptInvitation(token);
        router.replace(`/${locale}/company/team`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : t('invitations.errors.generic'));
      }
    });
  };

  const status = preview.status;
  const expired = new Date(preview.expiresAt).getTime() < Date.now();
  const canAccept = status === 'PENDING' && !expired && preview.emailMatchesViewer;

  return (
    <div className="card space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-slate-500">{t('invitations.company')}</dt>
        <dd className="font-medium text-slate-900">{preview.companyName}</dd>
        <dt className="text-slate-500">{t('invitations.role')}</dt>
        <dd className="font-medium text-slate-900">{t(`company.team.roles.${preview.role}`)}</dd>
        <dt className="text-slate-500">{t('invitations.invitedBy')}</dt>
        <dd className="font-medium text-slate-900">{preview.inviterName ?? '—'}</dd>
        <dt className="text-slate-500">{t('invitations.invitedEmail')}</dt>
        <dd className="font-medium text-slate-900">{preview.email}</dd>
        <dt className="text-slate-500">{t('invitations.expiresAt')}</dt>
        <dd className="font-medium text-slate-900">
          {new Date(preview.expiresAt).toLocaleString()}
        </dd>
        <dt className="text-slate-500">{t('invitations.status')}</dt>
        <dd className="font-medium text-slate-900">{t(`company.team.statuses.${status}`)}</dd>
      </dl>

      {!preview.emailMatchesViewer ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t('invitations.errors.emailMismatch', { email: preview.email })}
        </div>
      ) : null}
      {status !== 'PENDING' ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {t(`invitations.errors.${status.toLowerCase()}`)}
        </div>
      ) : expired ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {t('invitations.errors.expired')}
        </div>
      ) : null}
      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          className="btn-primary"
          disabled={!canAccept || pending}
          onClick={accept}
        >
          {t('invitations.accept')}
        </button>
        <a className="btn-secondary" href={`/${locale}`}>
          {t('invitations.cancel')}
        </a>
      </div>
    </div>
  );
}
