import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { NewContractForm } from './new-contract-form';

export default async function NewContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ applicationId?: string }>;
}) {
  const { locale } = await params;
  const { applicationId } = await searchParams;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/contracts/new`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations({ locale, namespace: 'contracts' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('newTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('newSubtitle')}</p>
      </header>
      {applicationId ? (
        <NewContractForm locale={locale} applicationId={applicationId} />
      ) : (
        <div className="rounded-3xl border border-white/40 bg-white/70 p-8 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('newNeedsApplication')}
          </p>
          <Link
            href={`/${locale}/company/dashboard`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            {t('backToDashboard')} →
          </Link>
        </div>
      )}
    </div>
  );
}
