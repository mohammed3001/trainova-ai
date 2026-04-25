import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { ContractDocumentKind, TemplateVariableInput } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { GenerateDocumentForm } from './generate-form';

interface PublishedTemplate {
  id: string;
  kind: ContractDocumentKind;
  slug: string;
  name: string;
  bodyMarkdown: string;
  locale: string;
  variables: TemplateVariableInput[];
}

export default async function NewContractDocumentPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) {
    redirect(`/${locale}/login?redirect=/${locale}/contracts/${id}/documents/new`);
  }
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    redirect(`/${locale}/contracts/${id}/documents`);
  }

  const [templates, t] = await Promise.all([
    authedFetch<PublishedTemplate[]>('/contract-templates').catch(
      () => [] as PublishedTemplate[],
    ),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);

  return (
    <div className="space-y-5">
      <Link
        href={`/${locale}/contracts/${id}/documents`}
        className="text-xs text-brand-600 hover:text-brand-700"
      >
        ← {t('list.back')}
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">{t('generate.title')}</h1>
      <p className="text-sm text-slate-500">{t('generate.subtitle')}</p>
      <GenerateDocumentForm
        locale={locale}
        contractId={id}
        templates={templates}
      />
    </div>
  );
}
