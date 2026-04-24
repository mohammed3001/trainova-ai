import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { PublicContract } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ContractDetailClient } from './contract-detail-client';

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/contracts/${id}`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const [contract, t] = await Promise.all([
    authedFetch<PublicContract>(`/contracts/${id}`).catch(() => null),
    getTranslations({ locale, namespace: 'contracts' }),
  ]);
  if (!contract) redirect(`/${locale}/company/contracts`);

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <Link
          href={`/${locale}/company/contracts`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {t('backToList')}
        </Link>
      </div>
      <ContractDetailClient locale={locale} contract={contract} viewer="COMPANY" />
    </div>
  );
}
