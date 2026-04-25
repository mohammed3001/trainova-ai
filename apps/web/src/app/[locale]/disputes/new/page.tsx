import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { DisputeForm } from '@/components/disputes/dispute-form';

export const dynamic = 'force-dynamic';

export default async function NewDisputePage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string }>;
}) {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/disputes/new`);
  if (role !== 'TRAINER' && role !== 'COMPANY_OWNER') {
    redirect(`/${locale}/dashboard`);
  }
  const { contractId } = await searchParams;
  if (!contractId) redirect(`/${locale}/disputes`);
  const t = await getTranslations({ locale, namespace: 'disputes.raise' });

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <Link
          href={`/${locale}/disputes`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {t('cancel')}
        </Link>
      </div>
      <header>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{t('title')}</h1>
      </header>
      <DisputeForm
        contractId={contractId}
        locale={locale}
        onCancelHref={`/${locale}/disputes`}
      />
    </div>
  );
}
