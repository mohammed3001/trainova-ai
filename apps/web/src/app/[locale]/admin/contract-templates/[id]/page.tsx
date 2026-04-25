import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type {
  ContractDocumentKind,
  ContractTemplateStatus,
  TemplateVariableInput,
} from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ContractTemplateForm } from '../template-form';

interface TemplateDetail {
  id: string;
  kind: ContractDocumentKind;
  slug: string;
  name: string;
  description: string | null;
  bodyMarkdown: string;
  locale: string;
  variables: TemplateVariableInput[];
  status: ContractTemplateStatus;
}

export default async function EditContractTemplatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) {
    redirect(`/${locale}/login?redirect=/${locale}/admin/contract-templates/${id}`);
  }
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') redirect(`/${locale}/dashboard`);

  const [template, t] = await Promise.all([
    authedFetch<TemplateDetail>(
      `/admin/contract-templates/${encodeURIComponent(id)}`,
    ).catch(() => null),
    getTranslations({ locale, namespace: 'contractDocs' }),
  ]);
  if (!template) redirect(`/${locale}/admin/contract-templates`);

  return (
    <div className="space-y-5">
      <Link
        href={`/${locale}/admin/contract-templates`}
        className="text-xs text-brand-600 hover:text-brand-700"
      >
        ← {t('admin.backToList')}
      </Link>
      <h1 className="text-2xl font-semibold text-slate-900">{template.name}</h1>
      <ContractTemplateForm locale={locale} template={template} />
    </div>
  );
}
