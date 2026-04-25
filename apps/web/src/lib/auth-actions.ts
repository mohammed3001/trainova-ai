'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { type UserRole } from '@trainova/shared';
import { adminLandingHref } from './admin-landing';
import { apiFetch } from './api';
import { AUTH_COOKIE, ROLE_COOKIE } from './session';

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

/**
 * Exported so the invitation-accept client can rotate the session
 * cookie pair atomically after `POST /team/invitations/accept` returns
 * a fresh JWT (the API may have transitioned `User.role`, which would
 * otherwise invalidate the existing token via `JwtStrategy.validate`).
 */
export async function rotateAuthCookies(token: string, role: string) {
  await setAuthCookies(token, role);
}

async function setAuthCookies(token: string, role: string) {
  const c = await cookies();
  // `secure` is enabled only in production so the cookie still works over
  // plain http on localhost and in CI. `sameSite: 'lax'` keeps redirect
  // flows working (logout + link-based verify/reset flows) while blocking
  // cross-site POSTs.
  const secure = process.env.NODE_ENV === 'production';
  const maxAge = 60 * 60 * 24 * 14;
  c.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  // Role cookie is intentionally not httpOnly: server components read it for
  // role-aware SSR nav, and there's no secret in the value (the token is the
  // secret, and that one IS httpOnly).
  c.set(ROLE_COOKIE, role, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

function redirectForRole(locale: string, role: string): string {
  if (role === 'COMPANY_OWNER' || role === 'COMPANY_MEMBER') return `/${locale}/company/dashboard`;
  if (role === 'TRAINER') return `/${locale}/trainer/dashboard`;
  // T7.D — SUPER_ADMIN/ADMIN land on /admin (overview); specialized
  // admin roles land on the first surface they can actually load, since
  // /admin/overview is class-level ALL and would 403 for them.
  return adminLandingHref(locale, role as UserRole);
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const locale = String(formData.get('locale') ?? 'en');
  try {
    const res = await apiFetch<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    await setAuthCookies(res.accessToken, res.user.role);
    redirect(redirectForRole(locale, res.user.role));
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
    return { error: (err as { message?: string })?.message ?? 'Login failed' };
  }
}

export async function registerAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? 'TRAINER');
  const locale = String(formData.get('locale') ?? 'en');
  try {
    const res = await apiFetch<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role, locale }),
    });
    await setAuthCookies(res.accessToken, res.user.role);
    redirect(redirectForRole(locale, res.user.role));
  } catch (err) {
    if ((err as { digest?: string })?.digest?.startsWith('NEXT_REDIRECT')) throw err;
    return { error: (err as { message?: string })?.message ?? 'Registration failed' };
  }
}

export async function forgotPasswordAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim();
  const locale = String(formData.get('locale') ?? 'en');
  try {
    await apiFetch<{ ok: true }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email, locale }),
    });
    return { sent: true as const };
  } catch (err) {
    return { error: (err as { message?: string })?.message ?? 'Request failed' };
  }
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  const token = String(formData.get('token') ?? '');
  const password = String(formData.get('password') ?? '');
  try {
    await apiFetch<{ reset: true }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
    return { done: true as const };
  } catch (err) {
    return { error: (err as { message?: string })?.message ?? 'Request failed' };
  }
}


