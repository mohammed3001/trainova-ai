import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { CompanyProfileForm } from './form';

interface Company {
  id: string;
  slug: string;
  name: string;
  websiteUrl: string | null;
  country: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  logoUrl: string | null;
}

export default async function CompanyProfilePage() {
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  // Only the owner is allowed to edit via the API's PATCH /companies/me.
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}/company/dashboard`);

  const company = await authedFetch<Company>('/companies/me');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('profile.company.title')}</h1>
        <p className="text-sm text-slate-500">{t('profile.company.subtitle')}</p>
      </header>
      <CompanyProfileForm company={company} />
    </div>
  );
}
