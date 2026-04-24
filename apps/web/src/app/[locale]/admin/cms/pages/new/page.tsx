import { getTranslations } from 'next-intl/server';
import { PageForm } from '../_form';

export default async function NewCmsPage() {
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.cms.pages.new')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('admin.cms.pages.subtitle')}</p>
      </header>
      <PageForm />
    </div>
  );
}
