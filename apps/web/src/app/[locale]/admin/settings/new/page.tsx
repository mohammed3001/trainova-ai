import { getLocale, getTranslations } from 'next-intl/server';
import { requireAdminGroup } from '@/lib/admin-guard';
import { SettingForm } from '../_form';

export const dynamic = 'force-dynamic';

export default async function NewSettingPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  await requireAdminGroup('SUPER_ONLY', `/${locale}/admin/settings/new`);
  const sp = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-800">
        {t('admin.settings.newCustomKey')}
      </h1>
      <SettingForm prefilledKey={sp?.key ?? ''} />
    </div>
  );
}
