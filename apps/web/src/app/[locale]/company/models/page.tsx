import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { PublicModelConnection } from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { ModelsClient } from './models-client';

interface Me {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Company {
  id: string;
  slug: string;
  name: string;
  nameAr: string | null;
}

export default async function CompanyModelsPage() {
  const t = await getTranslations('company.models');
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const [me, company] = await Promise.all([
    authedFetch<Me>('/auth/me'),
    authedFetch<Company>('/companies/me'),
  ]);
  const initial = await authedFetch<PublicModelConnection[]>(
    `/companies/${company.id}/models`,
  ).catch(() => [] as PublicModelConnection[]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-100 to-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:from-violet-500/10 dark:to-sky-500/10 dark:text-violet-300">
            {t('badge')}
          </span>
          <span className="text-[11px] text-slate-500">· {me.name}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          {t('title')}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t('subtitle')}
        </p>
      </header>

      <ModelsClient
        companyId={company.id}
        initial={initial}
        locale={locale}
      />
    </div>
  );
}
