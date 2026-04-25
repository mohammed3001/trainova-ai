import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { getRole, getToken } from '@/lib/session';
import { ContractTemplateForm } from '../template-form';

export default async function NewContractTemplatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [token, role, t] = await Promise.all([
    getToken(),
    getRole(),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/admin/contract-templates/new`);
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect(`/${locale}/dashboard`);

  return (
    <div className="space-y-5">
      <Link
        href={`/${locale}/admin/contract-templates`}
        className="text-xs text-brand-600 hover:text-brand-700"
      >
        ← {t('admin.backToList')}
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">{t('admin.newTemplate')}</h1>
      <ContractTemplateForm locale={locale} />
    </div>
  );
}
