'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from './api';
import { AUTH_COOKIE, ROLE_COOKIE } from './session';

interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

async function setAuthCookies(token: string, role: string) {
  const c = await cookies();
  c.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
  c.set(ROLE_COOKIE, role, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 14 });
}

function redirectForRole(locale: string, role: string): string {
  if (role === 'COMPANY_OWNER' || role === 'COMPANY_MEMBER') return `/${locale}/company/dashboard`;
  if (role === 'TRAINER') return `/${locale}/trainer/dashboard`;
  if (role === 'ADMIN' || role === 'SUPER_ADMIN') return `/${locale}/admin`;
  return `/${locale}`;
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


