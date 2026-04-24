import { getTranslations } from 'next-intl/server';
import { SettingForm } from '../_form';

export const dynamic = 'force-dynamic';

export default async function NewSettingPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const t = await getTranslations();
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
