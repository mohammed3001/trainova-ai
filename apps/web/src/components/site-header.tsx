import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { getToken, getRole } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { LocaleSwitcher } from './locale-switcher';

export async function SiteHeader() {
  const t = await getTranslations('common');
  const tc = await getTranslations('chat');
  const locale = await getLocale();
  const token = await getToken();
  const role = await getRole();
  const unread = token
    ? await authedFetch<{ total: number }>('/chat/unread-count')
        .then((r) => r.total)
        .catch(() => 0)
    : 0;

  const dashboardHref =
    role === 'COMPANY_OWNER'
      ? `/${locale}/company/dashboard`
      : role === 'TRAINER'
        ? `/${locale}/trainer/dashboard`
        : role === 'ADMIN' || role === 'SUPER_ADMIN'
          ? `/${locale}/admin`
          : `/${locale}/login`;

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <Link href={`/${locale}`} className="flex items-center gap-2 text-lg font-semibold text-brand-700">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">T</span>
            <span>Trainova AI</span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-slate-600 md:flex">
            <Link href={`/${locale}/requests`} className="hover:text-brand-700">{t('browseRequests')}</Link>
            <Link href={`/${locale}/trainers`} className="hover:text-brand-700">{t('browseTrainers')}</Link>
            <Link href={`/${locale}/skills`} className="hover:text-brand-700">{t('skills')}</Link>
            <Link href={`/${locale}/pricing`} className="hover:text-brand-700">{t('pricing')}</Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          {token ? (
            <>
              <Link
                href={`/${locale}/chat`}
                className="btn-ghost relative"
                data-testid="nav-chat"
                aria-label={tc('nav')}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  className="h-5 w-5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 1 1-17.8 1.66L3 21l7.34-.2A9 9 0 0 1 21 12Z" />
                </svg>
                <span className="hidden md:inline">{tc('nav')}</span>
                {unread > 0 ? (
                  <span
                    className="absolute -end-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white"
                    data-testid="nav-chat-unread"
                  >
                    {unread > 99 ? '99+' : unread}
                  </span>
                ) : null}
              </Link>
              <Link href={dashboardHref} className="btn-secondary">{t('dashboard')}</Link>
              <Link href={`/api/logout?locale=${locale}`} prefetch={false} className="btn-ghost">{t('signOut')}</Link>
            </>
          ) : (
            <>
              <Link href={`/${locale}/login`} className="btn-ghost">{t('signIn')}</Link>
              <Link href={`/${locale}/register`} className="btn-primary">{t('getStarted')}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
