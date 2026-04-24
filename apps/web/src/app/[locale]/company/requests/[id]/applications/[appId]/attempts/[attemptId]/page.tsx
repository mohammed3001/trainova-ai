import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { GradingConsole, type AttemptView } from './grading-console';

export default async function GradeAttemptPage({
  params,
}: {
  params: Promise<{ id: string; appId: string; attemptId: string; locale: string }>;
}) {
  const { id, appId, attemptId } = await params;
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const backUrl = `/${locale}/company/requests/${id}/applications/${appId}`;
  const attempt = await authedFetch<AttemptView>(`/tests/attempts/${attemptId}`).catch(
    () => null,
  );
  if (!attempt) redirect(backUrl);

  return <GradingConsole attempt={attempt} backUrl={backUrl} />;
}
