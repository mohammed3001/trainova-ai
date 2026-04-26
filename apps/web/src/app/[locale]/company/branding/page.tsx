import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { BrandingForm, type BrandingState } from './form';

export default async function CompanyBrandingPage() {
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}/company/dashboard`);

  const branding = await authedFetch<BrandingState>('/company/branding');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('whiteLabel.title')}</h1>
        <p className="text-sm text-slate-500">{t('whiteLabel.subtitle')}</p>
      </header>
      <BrandingForm initial={branding} />
    </div>
  );
}
