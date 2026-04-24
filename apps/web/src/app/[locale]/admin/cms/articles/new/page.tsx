import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ArticleForm } from '../_form';

interface Category {
  id: string;
  nameEn: string;
  nameAr: string;
}

export default async function NewArticlePage() {
  const t = await getTranslations();
  const categories = await authedFetch<Category[]>(`/admin/cms/categories`);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.cms.articles.new')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('admin.cms.articles.subtitle')}
        </p>
      </header>
      <ArticleForm categories={categories} />
    </div>
  );
}
