'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-reporter';

/**
 * Polish pass — locale-scoped error boundary. Catches errors raised by
 * any page below `app/[locale]/` and forwards them to the Sentry-shaped
 * reporter when `NEXT_PUBLIC_SENTRY_DSN` is configured. Keeps copy
 * generic (no i18n strings) because next-intl's provider is below this
 * boundary in the tree — by the time we render, `useTranslations` is
 * unavailable. The full i18n homepage is one click away via the reset
 * button.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      digest: error.digest,
      route: typeof window !== 'undefined' ? window.location.pathname : undefined,
      tags: { surface: 'locale-error-boundary' },
    });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center" data-testid="error-boundary">
      <h1 className="text-2xl font-semibold text-slate-900">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-600">
        We hit an unexpected error. Our team has been notified.
        {error.digest ? (
          <span className="mt-1 block font-mono text-xs text-slate-400">ref: {error.digest}</span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        Try again
      </button>
    </div>
  );
}
