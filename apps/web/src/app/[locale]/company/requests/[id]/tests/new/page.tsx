import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { TestEditor } from '../test-editor';

export default async function NewTestPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const listUrl = `/${locale}/company/requests/${id}/tests`;
  return (
    <TestEditor mode="create" requestId={id} backUrl={listUrl} listUrl={listUrl} />
  );
}
