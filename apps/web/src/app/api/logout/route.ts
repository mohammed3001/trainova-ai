import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, ROLE_COOKIE } from '@/lib/session';

const VALID_LOCALES = new Set(['en', 'ar']);

export async function GET(req: NextRequest) {
  const localeParam = req.nextUrl.searchParams.get('locale') ?? 'en';
  const locale = VALID_LOCALES.has(localeParam) ? localeParam : 'en';
  const c = await cookies();
  c.delete(AUTH_COOKIE);
  c.delete(ROLE_COOKIE);
  return NextResponse.redirect(new URL(`/${locale}`, req.url));
}

export const POST = GET;
