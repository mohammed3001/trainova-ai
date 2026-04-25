import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import {
  SUPPORTED_DISPLAY_CURRENCIES,
  SUPPORTED_LOCALES,
  type PreferencesResponse,
} from '@trainova/shared';
import { getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { PreferencesForm } from './form';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function SettingsPage({ params }: Props) {
  const { locale } = await params;
  const token = await getToken();
  if (!token) redirect(`/${locale}/login?next=/${locale}/settings`);
  const [t, prefs] = await Promise.all([
    getTranslations({ locale, namespace: 'preferences' }),
    authedFetch<PreferencesResponse>('/users/me/preferences'),
  ]);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {t('subtitle')}
        </p>
      </header>
      <PreferencesForm
        initial={prefs}
        locales={SUPPORTED_LOCALES}
        currencies={SUPPORTED_DISPLAY_CURRENCIES}
      />
    </main>
  );
}
