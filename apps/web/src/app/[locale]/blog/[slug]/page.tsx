import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, buildMetadata, type JsonLdObject } from '@/lib/seo';
import type { Locale } from '@/i18n/config';

interface Article {
  id: string;
  slug: string;
  locale: string;
  title: string;
  summary: string | null;
  bodyHtml: string;
  bodyMarkdown: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  updatedAt: string;
  authorName: string | null;
  category: { id: string; slug: string; nameEn: string; nameAr: string } | null;
}

interface ArticleListResponse {
  items: Pick<Article, 'id' | 'slug' | 'title' | 'summary' | 'publishedAt'>[];
  nextCursor: string | null;
}

export const revalidate = 1800;

function cmsLocaleOf(locale: string) {
  return locale === 'ar' ? 'AR' : locale === 'fr' ? 'FR' : locale === 'es' ? 'ES' : 'EN';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const article = await apiFetch<Article>(
      `/public/cms/articles/${encodeURIComponent(slug)}?locale=${cmsLocaleOf(locale)}`,
    );
    return buildMetadata({
      title: article.metaTitle ?? article.title,
      description: article.metaDescription ?? article.summary ?? article.title,
      path: `/blog/${article.slug}`,
      locale: locale as Locale,
      ogType: 'article',
    });
  } catch {
    return buildMetadata({
      title: 'Article not found',
      description: 'The requested article could not be found.',
      path: `/blog/${slug}`,
      locale: locale as Locale,
      noindex: true,
    });
  }
}

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const t = await getTranslations('marketing.blog');
  let article: Article;
  try {
    article = await apiFetch<Article>(
      `/public/cms/articles/${encodeURIComponent(slug)}?locale=${cmsLocaleOf(locale)}`,
    );
  } catch {
    notFound();
  }

  const related = await apiFetch<ArticleListResponse>(
    `/public/cms/articles?locale=${cmsLocaleOf(locale)}`,
  ).catch(() => ({ items: [], nextCursor: null }));
  const relatedItems = related.items.filter((a) => a.slug !== article.slug).slice(0, 3);

  const blogPostingLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.summary ?? article.metaDescription ?? undefined,
    inLanguage: locale,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt,
    author: article.authorName
      ? { '@type': 'Person', name: article.authorName }
      : { '@type': 'Organization', name: 'Trainova AI' },
    publisher: {
      '@type': 'Organization',
      name: 'Trainova AI',
      logo: {
        '@type': 'ImageObject',
        url: `${absoluteUrl('/', locale as Locale)}icon.png`,
      },
    },
    mainEntityOfPage: absoluteUrl(`/blog/${article.slug}`, locale as Locale),
  };

  const breadcrumbLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: t('hero.title'),
        item: absoluteUrl('/blog', locale as Locale),
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: article.title,
        item: absoluteUrl(`/blog/${article.slug}`, locale as Locale),
      },
    ],
  };

  return (
    <div className="space-y-10">
      <JsonLd data={[blogPostingLd, breadcrumbLd]} />
      <nav aria-label={t('breadcrumb')} className="text-sm text-slate-500">
        <Link href={`/${locale}`} className="hover:text-brand-700">
          {t('nav.home')}
        </Link>
        <span aria-hidden className="mx-2">›</span>
        <Link href={`/${locale}/blog`} className="hover:text-brand-700">
          {t('nav.blog')}
        </Link>
      </nav>

      <article className="space-y-6">
        <header className="space-y-3 border-b border-slate-200 pb-6">
          {article.category ? (
            <div className="text-xs font-medium uppercase tracking-wide text-brand-700">
              {locale === 'ar' ? article.category.nameAr : article.category.nameEn}
            </div>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            {article.title}
          </h1>
          {article.summary ? (
            <p className="text-lg text-slate-600">{article.summary}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            {article.authorName ? <span>{article.authorName}</span> : null}
            {article.publishedAt ? (
              <>
                <span aria-hidden>•</span>
                <time dateTime={article.publishedAt}>
                  {new Date(article.publishedAt).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
              </>
            ) : null}
          </div>
        </header>

        <div
          className="prose prose-slate max-w-none prose-headings:scroll-m-20 prose-a:text-brand-700 prose-img:rounded-xl"
          // bodyHtml is server-rendered admin-authored content; sanitised at write
          // time via the CMS admin pipeline.
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />
      </article>

      {relatedItems.length > 0 ? (
        <section aria-labelledby="related-articles" className="space-y-4 border-t border-slate-200 pt-10">
          <h2 id="related-articles" className="text-xl font-semibold text-slate-900">
            {t('related')}
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {relatedItems.map((a) => (
              <li
                key={a.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md"
              >
                <Link
                  href={`/${locale}/blog/${a.slug}`}
                  className="block h-full p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                >
                  <h3 className="text-base font-semibold text-slate-900 line-clamp-2">
                    {a.title}
                  </h3>
                  {a.summary ? (
                    <p className="mt-2 text-sm text-slate-600 line-clamp-3">{a.summary}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
