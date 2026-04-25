import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { AdminNav } from '@/components/admin/admin-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const links: Array<{ href: string; label: string }> = [
    { href: `/${locale}/admin`, label: t('admin.nav.overview') },
    { href: `/${locale}/admin/users`, label: t('admin.nav.users') },
    { href: `/${locale}/admin/companies`, label: t('admin.nav.companies') },
    { href: `/${locale}/admin/trainers`, label: t('admin.nav.trainers') },
    { href: `/${locale}/admin/verification`, label: t('admin.nav.verification') },
    { href: `/${locale}/admin/requests`, label: t('admin.nav.requests') },
    { href: `/${locale}/admin/tests`, label: t('admin.nav.tests') },
    { href: `/${locale}/admin/conversations`, label: t('admin.nav.conversations') },
    { href: `/${locale}/admin/reports`, label: t('admin.nav.reports') },
    { href: `/${locale}/admin/analytics`, label: t('admin.nav.analytics') },
    { href: `/${locale}/admin/cms/pages`, label: t('admin.nav.cmsPages') },
    { href: `/${locale}/admin/cms/articles`, label: t('admin.nav.cmsArticles') },
    { href: `/${locale}/admin/cms/categories`, label: t('admin.nav.cmsCategories') },
    { href: `/${locale}/admin/cms/faqs`, label: t('admin.nav.cmsFaqs') },
    { href: `/${locale}/admin/cms/feature-flags`, label: t('admin.nav.featureFlags') },
    { href: `/${locale}/admin/finance`, label: t('admin.nav.finance') },
    { href: `/${locale}/admin/settings`, label: t('admin.nav.settings') },
  ];

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 h-64 bg-gradient-to-br from-brand-500/15 via-fuchsia-400/10 to-transparent blur-3xl"
      />
      <div className="relative grid gap-6 lg:grid-cols-[220px,1fr]">
        <aside className="sticky top-4 self-start rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.nav.title')}
          </div>
          <AdminNav links={links} label={t('admin.nav.title')} />
        </aside>
        {/* `<main>` is already rendered by the locale layout —
            using <div> here avoids a nested landmark that would
            confuse AT (WCAG 1.3.1 — info and relationships). */}
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
