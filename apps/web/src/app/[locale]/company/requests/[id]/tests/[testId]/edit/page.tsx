import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { TestEditor, type TestEditorInitial } from '../../test-editor';

export default async function EditTestPage({
  params,
}: {
  params: Promise<{ id: string; testId: string; locale: string }>;
}) {
  const { id, testId } = await params;
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const listUrl = `/${locale}/company/requests/${id}/tests`;
  const initial = await authedFetch<TestEditorInitial>(`/tests/${testId}/edit`).catch(
    () => null,
  );
  if (!initial) redirect(listUrl);

  return (
    <TestEditor
      mode="edit"
      requestId={id}
      backUrl={listUrl}
      listUrl={listUrl}
      initial={{ ...initial, id: testId }}
    />
  );
}
