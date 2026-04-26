import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  ADMIN_ROLE_GROUPS,
  isAdminRole,
  type AdminRole,
  type UserRole,
} from '@trainova/shared';
import { getRole, getToken } from '@/lib/session';
import { AdminNav } from '@/components/admin/admin-nav';

/**
 * T7.D — given an admin role, return the set of nav links it should see.
 * Each link advertises which `AdminRoleGroup` is allowed to enter that
 * admin surface. SUPER_ADMIN/ADMIN see everything; specialized roles
 * only see their domain.
 */
type AdminLink = {
  href: string;
  label: string;
  group: readonly AdminRole[];
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  const typedRole = (role ?? null) as UserRole | null;
  if (!isAdminRole(typedRole)) redirect(`/${locale}`);
  const adminRole: AdminRole = typedRole;

  const all = ADMIN_ROLE_GROUPS.ALL;
  const moderation = ADMIN_ROLE_GROUPS.MODERATION;
  const finance = ADMIN_ROLE_GROUPS.FINANCE;
  const content = ADMIN_ROLE_GROUPS.CONTENT;
  const ads = ADMIN_ROLE_GROUPS.ADS;
  const verification = ADMIN_ROLE_GROUPS.VERIFICATION;
  const superOnly = ADMIN_ROLE_GROUPS.SUPER_ONLY;

  const allLinks: AdminLink[] = [
    { href: `/${locale}/admin`, label: t('admin.nav.overview'), group: all },
    { href: `/${locale}/admin/users`, label: t('admin.nav.users'), group: all },
    { href: `/${locale}/admin/companies`, label: t('admin.nav.companies'), group: all },
    { href: `/${locale}/admin/trainers`, label: t('admin.nav.trainers'), group: all },
    { href: `/${locale}/admin/verification`, label: t('admin.nav.verification'), group: verification },
    { href: `/${locale}/admin/requests`, label: t('admin.nav.requests'), group: moderation },
    { href: `/${locale}/admin/tests`, label: t('admin.nav.tests'), group: all },
    { href: `/${locale}/admin/conversations`, label: t('admin.nav.conversations'), group: moderation },
    { href: `/${locale}/admin/reports`, label: t('admin.nav.reports'), group: moderation },
    { href: `/${locale}/admin/analytics`, label: t('admin.nav.analytics'), group: all },
    { href: `/${locale}/admin/cms/pages`, label: t('admin.nav.cmsPages'), group: content },
    { href: `/${locale}/admin/cms/articles`, label: t('admin.nav.cmsArticles'), group: content },
    { href: `/${locale}/admin/cms/categories`, label: t('admin.nav.cmsCategories'), group: content },
    { href: `/${locale}/admin/cms/faqs`, label: t('admin.nav.cmsFaqs'), group: content },
    { href: `/${locale}/admin/cms/feature-flags`, label: t('admin.nav.featureFlags'), group: superOnly },
    { href: `/${locale}/admin/email-templates`, label: t('admin.nav.emailTemplates'), group: content },
    { href: `/${locale}/admin/learning-paths`, label: t('admin.nav.learningPaths'), group: content },
    { href: `/${locale}/admin/disputes`, label: t('admin.nav.disputes'), group: moderation },
    { href: `/${locale}/admin/ads`, label: t('admin.nav.ads'), group: ads },
    { href: `/${locale}/admin/sponsored`, label: t('admin.nav.sponsored'), group: ads },
    { href: `/${locale}/admin/finance`, label: t('admin.nav.finance'), group: finance },
    { href: `/${locale}/admin/coupons`, label: t('admin.nav.coupons'), group: finance },
    { href: `/${locale}/admin/settings`, label: t('admin.nav.settings'), group: superOnly },
  ];
  const links = allLinks.filter((l) =>
    (l.group as readonly string[]).includes(adminRole),
  );

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
