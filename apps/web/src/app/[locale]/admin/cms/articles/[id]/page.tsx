import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ArticleForm } from '../_form';
import { deleteArticleAction } from '@/lib/cms-actions';

interface ArticleRow {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
  categoryId: string | null;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
  category: { id: string; nameEn: string; nameAr: string } | null;
}

interface Category {
  id: string;
  nameEn: string;
  nameAr: string;
}

export default async function EditArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations();
  const { id } = await params;
  const [article, categories] = await Promise.all([
    authedFetch<ArticleRow>(`/admin/cms/articles/${id}`),
    authedFetch<Category[]>(`/admin/cms/categories`),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.articles.edit')}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">
            /{article.slug} · {article.locale}
          </p>
        </div>
        <form action={deleteArticleAction}>
          <input type="hidden" name="id" value={article.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          >
            {t('admin.cms.delete')}
          </button>
        </form>
      </header>
      <ArticleForm initial={article} categories={categories} />
      <details className="rounded-2xl border border-white/60 bg-white/60 p-3 text-sm text-slate-600 shadow-sm backdrop-blur-md">
        <summary className="cursor-pointer select-none font-semibold">
          {t('admin.jsonAccordion')}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">
          {JSON.stringify(article, null, 2)}
        </pre>
      </details>
    </div>
  );
}
