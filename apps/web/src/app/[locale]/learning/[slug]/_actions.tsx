'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { completeNextStep, enrollInPath } from '@/lib/learning-paths-api';

interface Step {
  id: string;
  kind: 'ARTICLE' | 'LINK' | 'VIDEO' | 'REFLECTION';
  title: string;
}

export function LearningPathActions({
  slug,
  locale,
  isEnrolled,
  isCompleted,
  nextStep,
  totalSteps,
  doneSteps,
  certificateSerial,
}: {
  slug: string;
  locale: string;
  isEnrolled: boolean;
  isCompleted: boolean;
  nextStep: Step | null;
  totalSteps: number;
  doneSteps: number;
  certificateSerial: string | null;
}) {
  const t = useTranslations('learning.detail');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (isCompleted) {
    return (
      <div className="space-y-3">
        <p className="font-semibold text-emerald-700">{t('completed')}</p>
        {certificateSerial ? (
          <a
            href={`/${locale}/certificates/${certificateSerial}`}
            className="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('viewCertificate')}
          </a>
        ) : null}
      </div>
    );
  }

  if (!isEnrolled) {
    return (
      <div className="space-y-3">
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              try {
                await enrollInPath(slug);
                router.refresh();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed');
              }
            });
          }}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
        >
          {t('enroll')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-700">
        {t('progressLabel', { done: doneSteps, total: totalSteps })}
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full bg-emerald-500 transition-all"
          style={{
            width: totalSteps > 0 ? `${(doneSteps / totalSteps) * 100}%` : '0%',
          }}
        />
      </div>
      {nextStep ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">{nextStep.title}</p>
          {nextStep.kind === 'REFLECTION' ? (
            <div className="space-y-1">
              <label htmlFor="reflection-textarea" className="block text-xs font-medium text-slate-500">
                {t('reflectionPrompt')}
              </label>
              <textarea
                id="reflection-textarea"
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder={t('reflectionPlaceholder')}
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              />
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await completeNextStep(
                    slug,
                    nextStep.kind === 'REFLECTION' && reflection.trim()
                      ? reflection.trim()
                      : undefined,
                  );
                  setReflection('');
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Failed');
                }
              });
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          >
            {t('completeNext')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
