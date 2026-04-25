import Link from 'next/link';
import type { Metadata } from 'next';
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
  publishedAt: string | null;
  category: { id: string; slug: string; nameEn: string; nameAr: string } | null;
}

interface ArticleListResponse {
  items: Article[];
  nextCursor: string | null;
}

export const revalidate = 1800;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'seo.blog' });
  return buildMetadata({
    title: t('title'),
    description: t('description'),
    path: '/blog',
    locale: locale as Locale,
  });
}

export default async function BlogIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { locale } = await params;
  const { cursor } = await searchParams;
  const t = await getTranslations('marketing.blog');
  const cmsLocale = locale === 'ar' ? 'AR' : locale === 'fr' ? 'FR' : locale === 'es' ? 'ES' : 'EN';

  const data = await apiFetch<ArticleListResponse>(
    `/public/cms/articles?locale=${cmsLocale}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
  ).catch(() => ({ items: [], nextCursor: null }));

  const collectionLd: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('hero.title'),
    description: t('hero.body'),
    inLanguage: locale,
    url: absoluteUrl('/blog', locale as Locale),
    mainEntity: data.items.map((a) => ({
      '@type': 'BlogPosting',
      headline: a.title,
      url: absoluteUrl(`/blog/${a.slug}`, locale as Locale),
      datePublished: a.publishedAt ?? undefined,
    })),
  };

  return (
    <div className="space-y-10">
      <JsonLd data={collectionLd} />
      <header className="space-y-3">
        <span className="badge">{t('hero.eyebrow')}</span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          {t('hero.title')}
        </h1>
        <p className="max-w-2xl text-slate-600">{t('hero.body')}</p>
      </header>

      {data.items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-600">
          {t('empty')}
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.items.map((a) => (
            <li
              key={a.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <Link
                href={`/${locale}/blog/${a.slug}`}
                className="block h-full p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {a.category ? (
                  <div className="text-xs font-medium uppercase tracking-wide text-brand-700">
                    {locale === 'ar' ? a.category.nameAr : a.category.nameEn}
                  </div>
                ) : null}
                <h2 className="mt-2 text-lg font-semibold text-slate-900 line-clamp-2">
                  {a.title}
                </h2>
                {a.summary ? (
                  <p className="mt-2 text-sm text-slate-600 line-clamp-3">{a.summary}</p>
                ) : null}
                {a.publishedAt ? (
                  <time
                    dateTime={a.publishedAt}
                    className="mt-3 block text-xs text-slate-500"
                  >
                    {new Date(a.publishedAt).toLocaleDateString(locale, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </time>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.nextCursor ? (
        <div className="flex justify-center">
          <Link
            href={`/${locale}/blog?cursor=${encodeURIComponent(data.nextCursor)}`}
            className="btn-secondary"
          >
            {t('loadMore')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
