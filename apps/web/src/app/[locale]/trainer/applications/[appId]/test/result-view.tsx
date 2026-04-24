import { getTranslations } from 'next-intl/server';
import type { TrainerAttempt, TrainerTestView } from './test-taker';

export async function ResultView({
  test,
  attempt,
}: {
  test: TrainerTestView;
  attempt: TrainerAttempt;
}) {
  const t = await getTranslations();
  const isGraded = attempt.status === 'GRADED';
  const total = attempt.totalScore;
  const passingScore = test.passingScore;
  const passed = total !== null ? total >= passingScore : null;

  return (
    <section
      className="card space-y-3"
      data-testid="trainer-test-result"
      data-status={attempt.status}
    >
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-slate-900">
          {t('trainer.tests.result.title')}
        </h1>
        <p className="text-sm text-slate-600">
          {t('trainer.tests.page.title', { testTitle: test.title })}
        </p>
        {attempt.submittedAt ? (
          <p className="text-xs text-slate-500">
            {t('trainer.tests.result.submittedAt', {
              date: new Date(attempt.submittedAt).toLocaleString(),
            })}
          </p>
        ) : null}
      </header>

      <div className="space-y-2 text-sm text-slate-700">
        {isGraded ? (
          <>
            <p className="font-medium">{t('trainer.tests.result.graded')}</p>
            {total !== null ? (
              <p
                className="text-base font-semibold text-slate-900"
                data-testid="trainer-total-score"
              >
                {t('trainer.tests.result.totalScore', { score: total })}
              </p>
            ) : null}
            {passed === true ? (
              <p className="text-sm text-emerald-700">
                {t('trainer.tests.result.passed', { score: passingScore })}
              </p>
            ) : passed === false ? (
              <p className="text-sm text-amber-700">
                {t('trainer.tests.result.missed', { score: passingScore })}
              </p>
            ) : null}
          </>
        ) : (
          <>
            {total !== null ? (
              <p
                className="text-base font-semibold text-slate-900"
                data-testid="trainer-auto-score"
              >
                {t('trainer.tests.result.autoScore', { score: total })}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">{t('trainer.tests.result.pending')}</p>
          </>
        )}
      </div>
    </section>
  );
}
