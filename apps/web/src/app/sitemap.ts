import type { MetadataRoute } from 'next';
import { locales } from '@/i18n/config';
import { siteUrl } from '@/lib/seo';
import { apiFetch } from '@/lib/api';

interface SitemapEntriesResponse {
  generatedAt: string;
  trainers: { slug: string; updatedAt: string; verified: boolean }[];
  companies: { slug: string; updatedAt: string }[];
  requests: { slug: string; updatedAt: string; publishedAt: string | null }[];
  skills: { slug: string; updatedAt: string }[];
}

/** Locale-free static routes emitted for every supported locale. */
const STATIC_ROUTES: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
  { path: '', changeFrequency: 'daily', priority: 1.0 },
  { path: '/trainers', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/requests', changeFrequency: 'hourly', priority: 0.9 },
  { path: '/skills', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/pricing', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/about', changeFrequency: 'monthly', priority: 0.4 },
];

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const entries: MetadataRoute.Sitemap = [];

  for (const route of STATIC_ROUTES) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}${route.path}`,
        lastModified: new Date(),
        changeFrequency: route.changeFrequency,
        priority: route.priority,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${base}/${l}${route.path}`]),
          ),
        },
      });
    }
  }

  let data: SitemapEntriesResponse | null = null;
  try {
    data = await apiFetch<SitemapEntriesResponse>('/public/sitemap-entries');
  } catch {
    // Keep sitemap valid even if the API is momentarily unreachable; Google
    // prefers a partial sitemap over a 500. Static routes are enough to prove
    // structural coverage; dynamic URLs will appear on the next crawl.
    return entries;
  }

  for (const t of data.trainers) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}/trainers/${t.slug}`,
        lastModified: new Date(t.updatedAt),
        changeFrequency: 'weekly',
        priority: t.verified ? 0.8 : 0.6,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${base}/${l}/trainers/${t.slug}`]),
          ),
        },
      });
    }
  }

  for (const c of data.companies) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}/companies/${c.slug}`,
        lastModified: new Date(c.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${base}/${l}/companies/${c.slug}`]),
          ),
        },
      });
    }
  }

  for (const r of data.requests) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}/requests/${r.slug}`,
        lastModified: new Date(r.updatedAt),
        changeFrequency: 'daily',
        priority: 0.8,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${base}/${l}/requests/${r.slug}`]),
          ),
        },
      });
    }
  }

  for (const s of data.skills) {
    for (const locale of locales) {
      entries.push({
        url: `${base}/${locale}/skills/${s.slug}`,
        lastModified: new Date(s.updatedAt),
        changeFrequency: 'weekly',
        priority: 0.5,
        alternates: {
          languages: Object.fromEntries(
            locales.map((l) => [l, `${base}/${l}/skills/${s.slug}`]),
          ),
        },
      });
    }
  }

  return entries;
}
