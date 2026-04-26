'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/error-reporter';

/**
 * Polish pass — top-level error boundary that wraps the *root* layout.
 * Next.js renders this when an error escapes a more specific
 * `error.tsx` (e.g. a render crash inside `app/layout.tsx` itself or
 * the locale layout). Must include `<html>` + `<body>` because it
 * replaces the entire document tree.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, {
      digest: error.digest,
      tags: { surface: 'global-error-boundary' },
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <div className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
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
      </body>
    </html>
  );
}
