import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import {
  ADMIN_ROLE_GROUPS,
  type EmailTemplateKey,
  type EmailTemplateSpec,
} from '@trainova/shared';
import { TemplateEditor } from '../editor';

interface Row {
  id: string;
  key: EmailTemplateKey;
  locale: 'en' | 'ar';
  subject: string;
  bodyHtml: string;
  bodyText: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
  createdAt: string;
  updatedBy: { id: string; name: string; email: string } | null;
}

interface SpecsResponse {
  specs: EmailTemplateSpec[];
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EmailTemplateDetailPage({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const [row, specs] = await Promise.all([
    authedFetch<Row>(`/admin/email-templates/${id}`),
    authedFetch<SpecsResponse>('/admin/email-templates/specs'),
  ]);

  const spec = specs.specs.find((s) => s.key === row.key);
  if (!spec) {
    // Unknown key — row must have been created before the spec existed.
    // Synthesize a minimal spec so the editor still renders.
    return (
      <div className="card bg-rose-50 text-rose-900">
        {t('admin.emailTemplates.unknownKey', { key: row.key })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <nav className="text-xs text-slate-500">
            <Link href={`/${locale}/admin/email-templates`} className="hover:underline">
              {t('admin.emailTemplates.title')}
            </Link>
            <span className="mx-2">·</span>
            <span className="font-mono">{row.key}</span>
            <span className="mx-2">·</span>
            <span className="uppercase">{row.locale}</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {t('admin.emailTemplates.edit')}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {t('admin.emailTemplates.editedAt', {
              when: new Date(row.updatedAt).toLocaleString(locale),
            })}
            {row.updatedBy && ` · ${row.updatedBy.name}`}
          </p>
        </div>
      </header>

      <TemplateEditor
        initial={{
          id: row.id,
          key: row.key,
          locale: row.locale,
          subject: row.subject,
          bodyHtml: row.bodyHtml,
          bodyText: row.bodyText,
          enabled: row.enabled,
          description: row.description,
        }}
        spec={spec}
      />
    </div>
  );
}
