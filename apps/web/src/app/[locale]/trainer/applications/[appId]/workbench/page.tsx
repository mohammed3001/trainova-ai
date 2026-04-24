import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { PublicModelCall } from '@trainova/shared';
import { WorkbenchClient, type WorkbenchContext } from './workbench-client';

export default async function TrainerWorkbenchPage({
  params,
}: {
  params: Promise<{ appId: string; locale: string }>;
}) {
  const { appId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('trainer.workbench');
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const backUrl = `/${locale}/trainer/dashboard`;
  const [context, initialCalls] = await Promise.all([
    authedFetch<WorkbenchContext>(`/applications/${appId}/workbench/context`).catch(
      () => null,
    ),
    authedFetch<PublicModelCall[]>(`/applications/${appId}/workbench/calls`).catch(
      () => [] as PublicModelCall[],
    ),
  ]);

  const back = (
    <div className="text-xs">
      <Link href={backUrl} className="text-brand-600 hover:text-brand-700">
        ← {t('back')}
      </Link>
    </div>
  );

  if (!context) {
    return (
      <div className="space-y-6">
        {back}
        <section className="card space-y-2" data-testid="workbench-missing">
          <h1 className="text-xl font-semibold text-slate-900">
            {t('empty.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('empty.body')}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <WorkbenchClient
        applicationId={appId}
        context={context}
        initialCalls={initialCalls}
      />
    </div>
  );
}
