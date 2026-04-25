import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';

export default async function AdminEmailMarketingHome() {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('admin.emailMarketing.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {t('admin.emailMarketing.subtitle')}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          className="card group block p-6 transition hover:shadow-lg"
          href={`/${locale}/admin/email-marketing/campaigns`}
        >
          <h2 className="text-xl font-semibold text-slate-900">
            {t('admin.emailMarketing.campaigns.title')}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {t('admin.emailMarketing.campaigns.subtitle')}
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-teal-600 group-hover:underline">
            {t('admin.emailMarketing.open')} →
          </span>
        </Link>
        <Link
          className="card group block p-6 transition hover:shadow-lg"
          href={`/${locale}/admin/email-marketing/drip`}
        >
          <h2 className="text-xl font-semibold text-slate-900">
            {t('admin.emailMarketing.drip.title')}
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            {t('admin.emailMarketing.drip.subtitle')}
          </p>
          <span className="mt-4 inline-block text-sm font-medium text-teal-600 group-hover:underline">
            {t('admin.emailMarketing.open')} →
          </span>
        </Link>
      </div>
    </div>
  );
}
