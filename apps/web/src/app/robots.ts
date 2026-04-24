import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private surfaces: dashboards, auth flow, admin console, API proxy.
        // Wildcards cover both locale-prefixed (/en/login) and root variants.
        disallow: [
          '/api/',
          '/admin',
          '/*/admin',
          '/*/admin/*',
          '/*/trainer/profile',
          '/*/trainer/dashboard',
          '/*/trainer/applications/',
          '/*/trainer/workbench',
          '/*/company/profile',
          '/*/company/dashboard',
          '/*/company/models',
          '/*/company/ads',
          '/*/login',
          '/*/register',
          '/*/forgot-password',
          '/*/reset-password',
          '/*/verify-email',
          '/*/chat',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
