'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { StarRating } from './star-rating';

interface Props {
  contractId: string;
  contractTitle: string;
  counterpartyName: string;
}

/**
 * Inline review form. Posts via the proxy route so the cookie-based JWT is
 * forwarded transparently. On success we refresh server data, which causes
 * the eligible list to mark the row done.
 */
export function ReviewForm({ contractId, contractTitle, counterpartyName }: Props) {
  const t = useTranslations('reviews.submit');
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/proxy/reviews', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contractId,
        rating,
        comment: comment.trim() ? comment.trim() : undefined,
      }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(body?.message ?? t('errorGeneric'));
      return;
    }
    setDone(true);
    startTransition(() => router.refresh());
  }

  if (done) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-300">
        {t('submittedAt', { at: new Date().toLocaleString() })}
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded-2xl border border-white/40 bg-white/70 p-4 backdrop-blur dark:border-white/10 dark:bg-slate-900/60"
      data-testid="review-form"
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {t('intro', { counterparty: counterpartyName, contract: contractTitle })}
      </p>
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('ratingLabel')}
        </label>
        <StarRating
          value={rating}
          onChange={setRating}
          size="lg"
          ariaLabelTemplate={(v) => `${v}`}
          testId="review-form-stars"
        />
      </div>
      <div className="space-y-1">
        <label
          className="text-xs font-medium text-slate-600 dark:text-slate-300"
          htmlFor={`review-comment-${contractId}`}
        >
          {t('commentLabel')}
        </label>
        <textarea
          id={`review-comment-${contractId}`}
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
          maxLength={2000}
          rows={4}
          placeholder={t('commentPlaceholder')}
          className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-100"
        />
      </div>
      {error ? (
        <p className="text-xs text-rose-700 dark:text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn-primary"
          data-testid="review-form-submit"
        >
          {t('submit')}
        </button>
      </div>
    </form>
  );
}
