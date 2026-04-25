import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';

export async function SiteFooter() {
  const t = await getTranslations('common');
  const tf = await getTranslations('footer');
  const ta = await getTranslations('a11y');
  const locale = await getLocale();

  const linkCls = 'rounded-md px-1 py-0.5 text-slate-700 hover:text-brand-700';
  const headingCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <nav
          aria-label={ta('footerNav')}
          className="grid grid-cols-2 gap-8 md:grid-cols-4"
        >
          <div className="space-y-3 text-sm">
            <h2 className={headingCls}>{tf('product')}</h2>
            <ul className="space-y-2">
              <li>
                <Link href={`/${locale}/how-it-works`} className={linkCls}>
                  {t('howItWorks')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/for-companies`} className={linkCls}>
                  {t('forCompanies')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/for-trainers`} className={linkCls}>
                  {t('forTrainers')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/pricing`} className={linkCls}>
                  {t('pricing')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm">
            <h2 className={headingCls}>{tf('resources')}</h2>
            <ul className="space-y-2">
              <li>
                <Link href={`/${locale}/blog`} className={linkCls}>
                  {t('blog')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/faq`} className={linkCls}>
                  {t('faq')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/skills`} className={linkCls}>
                  {t('skills')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/trainers`} className={linkCls}>
                  {t('browseTrainers')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/requests`} className={linkCls}>
                  {t('browseRequests')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm">
            <h2 className={headingCls}>{tf('company')}</h2>
            <ul className="space-y-2">
              <li>
                <Link href={`/${locale}/about`} className={linkCls}>
                  {t('about')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/contact`} className={linkCls}>
                  {t('contact')}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/advertise`} className={linkCls}>
                  {t('advertise')}
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3 text-sm">
            <h2 className={headingCls}>{tf('legal')}</h2>
            <ul className="space-y-2">
              <li>
                <Link href={`/${locale}/legal/privacy`} className={linkCls}>
                  Privacy
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/legal/terms`} className={linkCls}>
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </nav>

        <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-brand-700">{t('appName')}</div>
            <div className="text-xs text-slate-600">
              © {new Date().getFullYear()} Trainova AI. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
