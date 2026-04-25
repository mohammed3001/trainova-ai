import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { InvitationPreviewDto } from '@trainova/shared';
import { AcceptInvitationClient } from './accept-client';

export default async function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { token } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const auth = await getToken();
  if (!auth) {
    // Bounce to login and remember the destination so the invitee lands
    // back on this page after authenticating with the right account.
    const next = encodeURIComponent(`/${locale}/invitations/${token}`);
    redirect(`/${locale}/login?next=${next}`);
  }

  let preview: InvitationPreviewDto | null = null;
  let error: string | null = null;
  try {
    preview = await authedFetch<InvitationPreviewDto>(
      `/team/invitations/preview/${encodeURIComponent(token)}`,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unable to load invitation';
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('invitations.title')}</h1>
        <p className="text-sm text-slate-500">{t('invitations.subtitle')}</p>
      </header>
      {error || !preview ? (
        <div className="card border-rose-200 bg-rose-50 text-sm text-rose-700">
          {error ?? t('invitations.notFound')}
        </div>
      ) : (
        <AcceptInvitationClient preview={preview} token={token} />
      )}
    </div>
  );
}
