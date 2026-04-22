import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ForgotPasswordForm } from './form';

export default async function ForgotPasswordPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.forgotPasswordTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('auth.forgotPasswordLead')}</p>
        <ForgotPasswordForm locale={locale} />
        <p className="mt-4 text-sm text-slate-600">
          <Link href={`/${locale}/login`} className="font-semibold text-brand-700 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
