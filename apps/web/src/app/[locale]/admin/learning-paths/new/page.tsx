import { getTranslations } from 'next-intl/server';
import { requireAdminGroup } from '@/lib/admin-guard';
import { LearningPathForm } from '../_form';

export default async function NewLearningPathPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdminGroup('CONTENT', `/${locale}/admin/learning-paths/new`);
  const t = await getTranslations({ locale, namespace: 'learning' });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.new')}</h1>
      </header>
      <LearningPathForm locale={locale} initial={{}} />
    </div>
  );
}
