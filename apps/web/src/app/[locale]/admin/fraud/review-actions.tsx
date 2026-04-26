'use client';

import { useState, useTransition } from 'react';
import {
  reviewApplicationAction,
  clearReviewAction,
  rescoreApplicationAction,
} from './actions';

interface Props {
  applicationId: string;
  reviewed: boolean;
  t: {
    markReviewed: string;
    rescore: string;
    clearReview: string;
    notePlaceholder: string;
  };
}

export function ReviewActions({ applicationId, reviewed, t }: Props) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  function review() {
    setError(null);
    startTransition(async () => {
      const res = await reviewApplicationAction(applicationId, note);
      if (!res.ok) setError(res.error ?? 'Failed');
      else setNote('');
    });
  }

  function clear() {
    setError(null);
    startTransition(async () => {
      const res = await clearReviewAction(applicationId);
      if (!res.ok) setError(res.error ?? 'Failed');
    });
  }

  function rescore() {
    setError(null);
    startTransition(async () => {
      const res = await rescoreApplicationAction(applicationId);
      if (!res.ok) setError(res.error ?? 'Failed');
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
      {!reviewed ? (
        <>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t.notePlaceholder}
            maxLength={2000}
            className="input flex-1 min-w-[200px] text-xs"
            data-testid="fraud-note-input"
          />
          <button
            type="button"
            onClick={review}
            disabled={pending}
            className="btn-primary text-xs"
            data-testid="fraud-mark-reviewed"
          >
            {t.markReviewed}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="btn-secondary text-xs"
        >
          {t.clearReview}
        </button>
      )}
      <button
        type="button"
        onClick={rescore}
        disabled={pending}
        className="btn-secondary text-xs"
      >
        {t.rescore}
      </button>
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
