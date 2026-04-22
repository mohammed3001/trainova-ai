import { getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Server-side verification: we hit the API directly so the token is consumed
 * the moment the user lands on the page. This avoids a dead intermediate
 * state where the link has been rendered but not yet exchanged.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { token } = await searchParams;

  let state: 'missing' | 'success' | 'invalid' = 'missing';

  if (token) {
    try {
      await apiFetch<{ verified: true }>('/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      state = 'success';
    } catch {
      state = 'invalid';
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card">
        <h1 className="text-2xl font-bold text-slate-900">{t('auth.verifyEmailTitle')}</h1>
        <div className="mt-4">
          {state === 'success' ? (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
              {t('auth.verifyEmailSuccess')}
            </div>
          ) : state === 'invalid' ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {t('auth.verifyEmailInvalid')}
            </div>
          ) : (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {t('auth.verifyEmailMissing')}
            </div>
          )}
        </div>
        <p className="mt-6 text-sm text-slate-600">
          <Link href={`/${locale}/login`} className="font-semibold text-brand-700 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
