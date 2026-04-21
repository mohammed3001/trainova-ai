import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { apiFetch } from '@/lib/api';
import { NewRequestForm } from './form';

interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export default async function NewRequestPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const skills = await apiFetch<Skill[]>('/skills').catch(() => []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('dashboard.createRequest')}</h1>
      </header>
      <NewRequestForm locale={locale} skills={skills} />
    </div>
  );
}
