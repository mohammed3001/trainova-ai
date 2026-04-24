import { getTranslations } from 'next-intl/server';
import { FaqForm } from '../_form';

export default async function NewCmsFaqPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.cms.faqs.new')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('admin.cms.faqs.subtitle')}
        </p>
      </header>
      <FaqForm />
    </div>
  );
}
