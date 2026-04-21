import { cookies } from 'next/headers';

export const AUTH_COOKIE = 'trainova_token';
export const ROLE_COOKIE = 'trainova_role';

export async function getToken(): Promise<string | null> {
  const c = await cookies();
  return c.get(AUTH_COOKIE)?.value ?? null;
}

export async function getRole(): Promise<string | null> {
  const c = await cookies();
  return c.get(ROLE_COOKIE)?.value ?? null;
}
