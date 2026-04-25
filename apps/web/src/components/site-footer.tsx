import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';

export async function SiteFooter() {
  const t = await getTranslations('common');
  const ta = await getTranslations('a11y');
  const locale = await getLocale();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div>
          <div className="text-sm font-semibold text-brand-700">{t('appName')}</div>
          {/* slate-600 instead of slate-500 keeps 4.5:1 against white. */}
          <div className="text-xs text-slate-600">© {new Date().getFullYear()} Trainova AI. All rights reserved.</div>
        </div>
        <nav
          aria-label={ta('footerNav')}
          className="flex flex-wrap items-center gap-4 text-sm text-slate-700"
        >
          <Link href={`/${locale}/about`} className="rounded-md px-1 hover:text-brand-700">{t('about')}</Link>
          <Link href={`/${locale}/pricing`} className="rounded-md px-1 hover:text-brand-700">{t('pricing')}</Link>
          <Link href={`/${locale}/trainers`} className="rounded-md px-1 hover:text-brand-700">{t('browseTrainers')}</Link>
          <Link href={`/${locale}/requests`} className="rounded-md px-1 hover:text-brand-700">{t('browseRequests')}</Link>
        </nav>
      </div>
    </footer>
  );
}
