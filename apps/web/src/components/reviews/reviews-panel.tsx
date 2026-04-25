import { getTranslations } from 'next-intl/server';
import type { ReviewListItem, ReviewSummary } from '@trainova/shared';
import { apiFetch } from '@/lib/api';
import { StarRating } from './star-rating';

interface ReviewsResponse {
  items: ReviewListItem[];
  total: number;
  summary: ReviewSummary;
}

/**
 * Server component rendered at the bottom of the public trainer profile.
 * Reads the public review feed for the trainer's slug; tolerates the API
 * being offline (renders an empty state instead of erroring the page).
 */
export async function ReviewsPanel({
  trainerSlug,
  locale,
}: {
  trainerSlug: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'reviews.profile' });
  let data: ReviewsResponse;
  try {
    data = await apiFetch<ReviewsResponse>(
      `/trainers/${encodeURIComponent(trainerSlug)}/reviews?pageSize=10`,
    );
  } catch {
    data = {
      items: [],
      total: 0,
      summary: { count: 0, averageRating: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } },
    };
  }

  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <section className="card" data-testid="trainer-reviews">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('title')}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('subtitle')}
          </p>
        </div>
        {data.summary.count > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <StarRating value={Math.round(data.summary.averageRating)} readOnly size="sm" />
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {t('average', { rating: data.summary.averageRating.toFixed(1) })}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              · {t('count', { count: data.summary.count })}
            </span>
          </div>
        ) : null}
      </header>

      {data.items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          {t('empty')}
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {data.items.map((r) => (
            <li
              key={r.id}
              className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <StarRating
                    value={r.rating}
                    readOnly
                    size="sm"
                    ariaLabel={t('starsAria', { rating: r.rating })}
                  />
                  {r.contractId ? (
                    <span className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                      {t('verifiedBadge')}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {dateFmt.format(new Date(r.createdAt))}
                </span>
              </div>
              {r.comment ? (
                <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-300">
                  {r.comment}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                {r.contractTitle
                  ? t('byOnContract', {
                      author: r.author.displayName,
                      contract: r.contractTitle,
                    })
                  : t('by', { author: r.author.displayName })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
