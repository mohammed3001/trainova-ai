import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import type { EmailTemplateKey, EmailTemplateSpec } from '@trainova/shared';
import { NewTemplateForm } from './new-form';

interface SpecsResponse {
  specs: EmailTemplateSpec[];
}

interface PageProps {
  searchParams: Promise<{ key?: string; locale?: string }>;
}

export default async function NewEmailTemplatePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const specs = await authedFetch<SpecsResponse>('/admin/email-templates/specs');

  const initialKey = (sp.key as EmailTemplateKey | undefined) ?? specs.specs[0]?.key;
  const initialLocale = (sp.locale as 'en' | 'ar' | undefined) ?? 'en';

  return (
    <div className="space-y-6">
      <header>
        <nav className="text-xs text-slate-500">
          <Link href={`/${locale}/admin/email-templates`} className="hover:underline">
            {t('admin.emailTemplates.title')}
          </Link>
        </nav>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {t('admin.emailTemplates.newTitle')}
        </h1>
      </header>

      <NewTemplateForm
        specs={specs.specs}
        initialKey={initialKey}
        initialLocale={initialLocale}
      />
    </div>
  );
}
