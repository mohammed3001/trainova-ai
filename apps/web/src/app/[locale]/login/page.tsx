import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { LoginForm } from './form';

export default async function LoginPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.loginTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('common.appName')}</p>
        <LoginForm locale={locale} />
        <p className="mt-4 text-sm text-slate-600">
          {t('auth.noAccount')}{' '}
          <Link href={`/${locale}/register`} className="font-semibold text-brand-700 hover:underline">
            {t('common.register')}
          </Link>
        </p>
      </div>
    </div>
  );
}
