import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { TestTaker, type TrainerTestView, type TrainerAttempt } from './test-taker';
import { ResultView } from './result-view';

interface AssignedPayload {
  test: TrainerTestView | null;
  attempt: TrainerAttempt | null;
}

export default async function TrainerTestPage({
  params,
}: {
  params: Promise<{ appId: string; locale: string }>;
}) {
  const { appId } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const backUrl = `/${locale}/trainer/dashboard`;
  const payload = await authedFetch<AssignedPayload>(
    `/applications/${appId}/assigned-test`,
  ).catch(() => ({ test: null, attempt: null }) as AssignedPayload);

  const back = (
    <div className="text-xs">
      <Link href={backUrl} className="text-brand-600 hover:text-brand-700">
        ← {t('trainer.tests.page.backToDashboard')}
      </Link>
    </div>
  );

  if (!payload.test) {
    return (
      <div className="space-y-6">
        {back}
        <section className="card space-y-2" data-testid="trainer-test-empty">
          <h1 className="text-xl font-semibold text-slate-900">
            {t('trainer.tests.page.noTest.title')}
          </h1>
          <p className="text-sm text-slate-500">{t('trainer.tests.page.noTest.body')}</p>
        </section>
      </div>
    );
  }

  const { test, attempt } = payload;

  // Already submitted — show the read-only result view. The reviewer notes
  // are already stripped server-side; we additionally filter out answerKey/
  // rubric which aren't in the trainer-facing task shape anyway.
  if (attempt && (attempt.status === 'SUBMITTED' || attempt.status === 'GRADED')) {
    return (
      <div className="space-y-6">
        {back}
        <ResultView test={test} attempt={attempt} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {back}
      <TestTaker applicationId={appId} test={test} attempt={attempt} />
    </div>
  );
}
