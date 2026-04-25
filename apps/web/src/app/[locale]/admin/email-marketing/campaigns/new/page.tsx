import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { CampaignForm } from '../campaign-form';

export default async function NewEmailCampaignPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.emailMarketing.campaigns.new')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('admin.emailMarketing.campaigns.newSubtitle')}
        </p>
      </header>
      <CampaignForm mode="create" />
    </div>
  );
}
