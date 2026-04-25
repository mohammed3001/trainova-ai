import { isAdminRole, type UserRole } from '@trainova/shared';

/**
 * T7.D — for an admin role, return the path of the first surface they can
 * actually load. SUPER_ADMIN and ADMIN go to the global /admin overview
 * (which calls /admin/overview, an ALL-only endpoint). Specialized roles
 * land on the domain page that AdminLayout's nav will surface to them, so
 * they never see a 403 from the overview API.
 */
export function adminLandingHref(locale: string, role: UserRole | null | undefined): string {
  if (!isAdminRole(role)) return `/${locale}`;
  switch (role) {
    case 'SUPER_ADMIN':
    case 'ADMIN':
      return `/${locale}/admin`;
    case 'MODERATOR':
      // Reports/conversations/disputes/requests are MODERATION; reports
      // is the canonical "moderation queue" entry point.
      return `/${locale}/admin/reports`;
    case 'FINANCE':
      return `/${locale}/admin/finance`;
    case 'SUPPORT':
      // SUPPORT is in VERIFICATION group; verification queue is its
      // primary surface.
      return `/${locale}/admin/verification`;
    case 'CONTENT_MANAGER':
      return `/${locale}/admin/cms/pages`;
    case 'ADS_MANAGER':
      return `/${locale}/admin/ads`;
    default:
      return `/${locale}/admin`;
  }
}
