import { redirect } from 'next/navigation';
import { ADMIN_ROLE_GROUPS, type AdminRoleGroup } from '@trainova/shared';
import { getRole, getToken } from './session';
import { adminLandingHref } from './admin-landing';

/**
 * T7.D — server-side guard for admin pages whose backend endpoints are
 * restricted to a specific role group.
 *
 * The `/admin` layout admits any admin role and the nav hides links the
 * current role isn't in. But a role outside `group` can still reach a
 * page via direct URL (bookmark, history, copy-paste). Those pages call
 * `authedFetch` against an endpoint protected by `@Roles(...group)`,
 * which returns 403 and bubbles into Next's error boundary as a 500.
 *
 * Call this at the top of any admin page whose API surface is narrower
 * than `ADMIN_ROLE_GROUPS.ALL`. It checks auth, then redirects roles
 * outside the group to the landing page they actually have access to.
 */
export async function requireAdminGroup(
  group: AdminRoleGroup,
  redirectPath: string,
): Promise<void> {
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) {
    redirect(`/login?redirect=${encodeURIComponent(redirectPath)}`);
  }
  const allowed = ADMIN_ROLE_GROUPS[group] as readonly string[];
  if (!allowed.includes(role ?? '')) {
    // Send the user to the surface they CAN reach — their landing page —
    // rather than a hard /dashboard fallback that may itself 403 and
    // produce a redirect loop for specialized admin roles.
    const locale = redirectPath.split('/')[1] ?? 'en';
    redirect(adminLandingHref(locale, (role as never) ?? null));
  }
}
