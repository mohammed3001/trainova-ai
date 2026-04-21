import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { getToken, getRole } from '@/lib/session';
import { LocaleSwitcher } from './locale-switcher';

export async function SiteHeader() {
  const t = await getTranslations('common');
  const locale = await getLocale();
  const token = await getToken();
  const role = await getRole();

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
              <Link href={dashboardHref} className="btn-secondary">{t('dashboard')}</Link>
              <Link href={`/${locale}/logout`} className="btn-ghost">{t('signOut')}</Link>
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
