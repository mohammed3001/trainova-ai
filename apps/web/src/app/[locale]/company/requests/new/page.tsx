import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { authedFetch } from '@/lib/authed-fetch';
import type { PublicModelConnection } from '@trainova/shared';
import { NewRequestForm, type ModelOption } from './form';

interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

interface MyCompany {
  id: string;
}

export default async function NewRequestPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const [skills, me] = await Promise.all([
    apiFetch<Skill[]>('/skills').catch(() => []),
    authedFetch<MyCompany | null>('/companies/me').catch(() => null),
  ]);
  const connections: PublicModelConnection[] = me
    ? await authedFetch<PublicModelConnection[]>(`/companies/${me.id}/models`).catch(
        () => [] as PublicModelConnection[],
      )
    : [];
  const modelOptions: ModelOption[] = connections
    .filter((c) => c.status === 'ACTIVE')
    .map((c) => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      modelId: c.modelId,
    }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('dashboard.createRequest')}</h1>
      </header>
      <NewRequestForm locale={locale} skills={skills} modelOptions={modelOptions} />
    </div>
  );
}
