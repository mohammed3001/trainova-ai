import type { Metadata } from 'next';
import { locales, defaultLocale, type Locale } from '@/i18n/config';

/**
 * Canonical site origin for metadata / JSON-LD / sitemap. Always served from
 * the public web host (NEXT_PUBLIC_SITE_URL); never from the API host.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Build the absolute URL for a locale-prefixed path, e.g.
 * `absoluteUrl('/trainers/foo', 'ar')` → `https://host/ar/trainers/foo`.
 * `path` must start with `/` and must NOT already include a locale prefix.
 */
export function absoluteUrl(path: string, locale: Locale = defaultLocale): string {
  if (!path.startsWith('/')) {
    throw new Error(`[seo] absoluteUrl requires a leading slash, got: ${path}`);
  }
  const stripped = stripLocalePrefix(path);
  return `${siteUrl()}/${locale}${stripped === '/' ? '' : stripped}`;
}

export function stripLocalePrefix(path: string): string {
  for (const l of locales) {
    if (path === `/${l}`) return '/';
    if (path.startsWith(`/${l}/`)) return path.slice(`/${l}`.length);
  }
  return path;
}

/**
 * hreflang alternates for every supported locale + x-default. Next.js merges
 * these into `<link rel="alternate" hrefLang="…" />` tags in the document
 * head — the signal Google uses to ship the right language variant to the
 * right user.
 */
export function alternateLanguages(path: string): {
  canonical: string;
  languages: Record<string, string>;
} {
  const stripped = stripLocalePrefix(path);
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = `${siteUrl()}/${l}${stripped === '/' ? '' : stripped}`;
  }
  languages['x-default'] = `${siteUrl()}/${defaultLocale}${stripped === '/' ? '' : stripped}`;
  return {
    canonical: languages[defaultLocale]!,
    languages,
  };
}

export interface SeoInput {
  title: string;
  description: string;
  /** Locale-free path starting with `/`. E.g. `/trainers/foo`. */
  path: string;
  locale: Locale;
  /** Full absolute OG image URL; if omitted, the route-level dynamic OG runs. */
  image?: string;
  /** Structured-data `type` hint for Open Graph. */
  ogType?: 'website' | 'profile' | 'article';
  /** Noindex / nofollow signal for pages that shouldn't land in search. */
  noindex?: boolean;
}

/**
 * Single entry point for page-level metadata. Ensures every public page emits:
 *   • canonical URL (default-locale variant)
 *   • `<link rel="alternate" hrefLang>` for all locales + x-default
 *   • Open Graph + Twitter cards with a sensible default image
 *   • robots directives (noindex flag for private routes)
 */
export function buildMetadata(input: SeoInput): Metadata {
  const { canonical, languages } = alternateLanguages(input.path);
  const localeUrl = languages[input.locale] ?? canonical;
  const og = {
    title: input.title,
    description: input.description,
    url: localeUrl,
    siteName: 'Trainova AI',
    locale: input.locale === 'ar' ? 'ar_SA' : 'en_US',
    type: input.ogType ?? 'website',
    images: input.image ? [{ url: input.image, width: 1200, height: 630 }] : undefined,
  };
  return {
    title: input.title,
    description: input.description,
    metadataBase: new URL(siteUrl()),
    alternates: {
      canonical: localeUrl,
      languages,
    },
    openGraph: og,
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      images: input.image ? [input.image] : undefined,
    },
    robots: input.noindex
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
  };
}

/** Noindex metadata for auth / dashboard / admin routes. */
export function privateRouteMetadata(opts: {
  title: string;
  description: string;
  path: string;
  locale: Locale;
}): Metadata {
  return buildMetadata({ ...opts, noindex: true });
}

// -----------------------------------------------------------------------------
// JSON-LD builders — every public page ships at least one. Consumed by a
// `<JsonLd />` React component that renders `<script type="application/ld+json">`.
// -----------------------------------------------------------------------------

export interface JsonLdObject {
  '@context': 'https://schema.org';
  '@type': string;
  [key: string]: unknown;
}

export function organizationLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Trainova AI',
    url: siteUrl(),
    logo: `${siteUrl()}/og/logo-512.png`,
    sameAs: [],
    description:
      'Global marketplace + evaluation system + collaboration workspace for AI training experts.',
  };
}

export function websiteLd(): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Trainova AI',
    url: siteUrl(),
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl()}/en/trainers?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbLd(items: { name: string; url: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function personLd(args: {
  name: string;
  url: string;
  jobTitle: string;
  description: string | null;
  country?: string | null;
  image?: string | null;
  sameAs?: (string | null | undefined)[];
  knowsAbout?: string[];
}): JsonLdObject {
  const sameAs = (args.sameAs ?? []).filter((x): x is string => !!x);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: args.name,
    url: args.url,
    jobTitle: args.jobTitle,
    ...(args.description ? { description: args.description } : {}),
    ...(args.country ? { nationality: args.country } : {}),
    ...(args.image ? { image: args.image } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(args.knowsAbout?.length ? { knowsAbout: args.knowsAbout } : {}),
  };
}

export function companyLd(args: {
  name: string;
  url: string;
  logo: string | null;
  description: string | null;
  country: string | null;
  industry: string | null;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: args.name,
    url: args.url,
    ...(args.logo ? { logo: args.logo } : {}),
    ...(args.description ? { description: args.description } : {}),
    ...(args.industry ? { industry: args.industry } : {}),
    ...(args.country ? { address: { '@type': 'PostalAddress', addressCountry: args.country } } : {}),
  };
}

export function jobPostingLd(args: {
  title: string;
  description: string;
  url: string;
  datePosted: string | null;
  validThrough: string | null;
  hiringOrgName: string;
  hiringOrgUrl: string;
  hiringOrgLogo: string | null;
  country: string | null;
  employmentType: string | null;
  skills: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: args.title,
    description: args.description,
    url: args.url,
    ...(args.datePosted ? { datePosted: args.datePosted } : {}),
    ...(args.validThrough ? { validThrough: args.validThrough } : {}),
    hiringOrganization: {
      '@type': 'Organization',
      name: args.hiringOrgName,
      sameAs: args.hiringOrgUrl,
      ...(args.hiringOrgLogo ? { logo: args.hiringOrgLogo } : {}),
    },
    ...(args.country
      ? {
          jobLocation: {
            '@type': 'Place',
            address: { '@type': 'PostalAddress', addressCountry: args.country },
          },
        }
      : { jobLocationType: 'TELECOMMUTE' }),
    ...(args.employmentType ? { employmentType: args.employmentType } : {}),
    ...(args.skills.length ? { skills: args.skills.join(', ') } : {}),
    ...(args.salaryMin != null && args.salaryMax != null && args.currency
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: args.currency,
            value: {
              '@type': 'QuantitativeValue',
              minValue: args.salaryMin,
              maxValue: args.salaryMax,
              unitText: 'MONTH',
            },
          },
        }
      : {}),
  };
}

export function collectionPageLd(args: {
  name: string;
  description: string;
  url: string;
}): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: args.name,
    description: args.description,
    url: args.url,
  };
}

export function faqLd(items: { question: string; answer: string }[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}
