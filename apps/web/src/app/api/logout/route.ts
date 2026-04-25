import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, ROLE_COOKIE } from '@/lib/session';
import { locales, defaultLocale } from '@/i18n/config';

const VALID_LOCALES: ReadonlySet<string> = new Set(locales);

export async function GET(req: NextRequest) {
  const localeParam = req.nextUrl.searchParams.get('locale') ?? defaultLocale;
  const locale = VALID_LOCALES.has(localeParam) ? localeParam : defaultLocale;
  const c = await cookies();
  c.delete(AUTH_COOKIE);
  c.delete(ROLE_COOKIE);
  return NextResponse.redirect(new URL(`/${locale}`, req.url));
}

export const POST = GET;
