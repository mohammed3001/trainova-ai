import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { SavedSearchesClient, type SavedSearch } from './client';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string }>;
}

export default async function SavedSearchesPage({ params }: Props) {
  const { locale } = await params;
  const token = await getToken();
  if (!token) redirect(`/${locale}/login?next=/${locale}/settings/saved-searches`);

  const [t, items] = await Promise.all([
    getTranslations({ locale, namespace: 'savedSearches' }),
    authedFetch<SavedSearch[]>('/saved-searches'),
  ]);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          {t('title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t('subtitle')}</p>
      </header>
      <SavedSearchesClient
        initial={items}
        labels={{
          name: t('name'),
          query: t('query'),
          industry: t('industry'),
          notify: t('notify'),
          create: t('create'),
          delete: t('delete'),
          empty: t('empty'),
          notifyOn: t('notifyOn'),
          notifyOff: t('notifyOff'),
          saving: t('saving'),
          deleting: t('deleting'),
          createError: t('createError'),
          updateError: t('updateError'),
          deleteError: t('deleteError'),
        }}
      />
    </main>
  );
}
