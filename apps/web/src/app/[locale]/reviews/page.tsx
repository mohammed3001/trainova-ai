import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ReviewForm } from '@/components/reviews/review-form';

export const dynamic = 'force-dynamic';

interface EligibleContract {
  contractId: string;
  title: string;
  counterpartyName: string;
  completedAt: string;
  hasReview: boolean;
}

/**
 * "Reviews you can leave" — surfaces the COMPLETED contracts where the
 * actor (trainer or company owner) has not yet posted a review. Inline
 * form posts to /reviews; once submitted the row marks itself done via
 * router.refresh() inside ReviewForm.
 */
export default async function ReviewsPage() {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/reviews`);
  if (role !== 'TRAINER' && role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const t = await getTranslations({ locale, namespace: 'reviews.eligible' });
  const tSubmit = await getTranslations({ locale, namespace: 'reviews.submit' });
  const items = await authedFetch<EligibleContract[]>(`/reviews/me/eligible`).catch(
    () => [] as EligibleContract[],
  );
  const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
          {t('heading')}
        </h1>
      </header>

      {items.length === 0 ? (
        <div className="card text-sm text-slate-500 dark:text-slate-400">{t('empty')}</div>
      ) : (
        <ul className="space-y-4">
          {items.map((c) => (
            <li
              key={c.contractId}
              className="card space-y-3"
              data-testid={`eligible-row-${c.contractId}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {c.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {c.counterpartyName} · {t('completedAt', { at: dateFmt.format(new Date(c.completedAt)) })}
                  </p>
                </div>
                {c.hasReview ? (
                  <span className="rounded-full border border-emerald-300/60 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                    {t('alreadyDone')}
                  </span>
                ) : null}
              </div>
              {c.hasReview ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tSubmit('alreadySubmitted')}
                </p>
              ) : (
                <ReviewForm
                  contractId={c.contractId}
                  contractTitle={c.title}
                  counterpartyName={c.counterpartyName}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
