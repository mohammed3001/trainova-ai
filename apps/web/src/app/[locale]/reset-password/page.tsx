import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ResetPasswordForm } from './form';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { token } = await searchParams;

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.resetPasswordTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('auth.resetPasswordLead')}</p>
        {token ? (
          <ResetPasswordForm token={token} locale={locale} />
        ) : (
          <div className="mt-6 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {t('auth.resetPasswordInvalid')}
          </div>
        )}
        <p className="mt-4 text-sm text-slate-600">
          <Link href={`/${locale}/login`} className="font-semibold text-brand-700 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
