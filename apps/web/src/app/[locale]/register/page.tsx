import { getTranslations, getLocale } from 'next-intl/server';
import Link from 'next/link';
import { RegisterForm } from './form';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { role } = await searchParams;
  const defaultRole = role === 'COMPANY_OWNER' ? 'COMPANY_OWNER' : 'TRAINER';
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.registerTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('common.tagline')}</p>
        <RegisterForm locale={locale} defaultRole={defaultRole} />
        <p className="mt-4 text-sm text-slate-600">
          {t('auth.haveAccount')}{' '}
          <Link href={`/${locale}/login`} className="font-semibold text-brand-700 hover:underline">
            {t('common.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
