import { getLocale, getTranslations } from 'next-intl/server';
import { requireAdminGroup } from '@/lib/admin-guard';
import { FeatureFlagForm } from '../_form';

export default async function NewCmsFeatureFlagPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  await requireAdminGroup('SUPER_ONLY', `/${locale}/admin/cms/feature-flags/new`);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.cms.featureFlags.new')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('admin.cms.featureFlags.subtitle')}
        </p>
      </header>
      <FeatureFlagForm />
    </div>
  );
}
