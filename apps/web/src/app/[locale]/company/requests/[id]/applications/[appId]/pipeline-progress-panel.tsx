'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type {
  ApplicationPipelineSnapshotDto,
  EvaluationStageStatus,
} from '@trainova/shared';
import {
  advanceStage,
  getApplicationProgress,
  rejectStage,
  skipStage,
  startApplicationProgress,
} from '@/lib/evaluation-pipelines-api';

const STATUS_TONE: Record<EvaluationStageStatus, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-800',
  PASSED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-rose-100 text-rose-800',
  SKIPPED: 'bg-slate-100 text-slate-500',
};

export function PipelineProgressPanel({
  applicationId,
  canEdit,
}: {
  applicationId: string;
  canEdit: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<ApplicationPipelineSnapshotDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getApplicationProgress(applicationId)
      .then((s) => {
        if (!cancelled) {
          setSnapshot(s);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId]);

  function refreshSnapshot() {
    getApplicationProgress(applicationId)
      .then((s) => setSnapshot(s))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  function onStart() {
    setError(null);
    startTransition(async () => {
      try {
        await startApplicationProgress(applicationId);
        refreshSnapshot();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onAdvance(progressId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await advanceStage(progressId, { notes: notes.trim() || undefined });
        setNotes('');
        refreshSnapshot();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onReject(progressId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await rejectStage(progressId, { reason: reason.trim() || undefined });
        setReason('');
        refreshSnapshot();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onSkip(progressId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await skipStage(progressId, { reason: reason.trim() || undefined });
        setReason('');
        refreshSnapshot();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  if (loading) {
    return (
      <section className="card text-sm text-slate-500" data-testid="pipeline-progress-loading">
        {t('company.pipeline.progress.loading')}
      </section>
    );
  }
  if (!snapshot) return null;

  const { pipeline, progress } = snapshot;
  const currentStageId = progress?.currentStageId ?? null;
  const stageResults = new Map(progress?.results.map((r) => [r.stageId, r]) ?? []);

  return (
    <section className="card space-y-4" data-testid="pipeline-progress-panel">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{pipeline.name}</h2>
          {pipeline.description ? (
            <p className="text-xs text-slate-600">{pipeline.description}</p>
          ) : null}
        </div>
        {progress ? (
          <span
            className={`rounded-full px-3 py-0.5 text-xs font-semibold ${
              progress.status === 'PASSED'
                ? 'bg-emerald-100 text-emerald-800'
                : progress.status === 'FAILED'
                  ? 'bg-rose-100 text-rose-800'
                  : progress.status === 'WITHDRAWN'
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-amber-100 text-amber-800'
            }`}
            data-testid="pipeline-progress-status"
          >
            {t(`company.pipeline.statuses.${progress.status}`)}
          </span>
        ) : null}
      </header>

      <ol className="space-y-2">
        {pipeline.stages.map((stage, idx) => {
          const result = stageResults.get(stage.id);
          const status = result?.status ?? 'PENDING';
          const isCurrent = stage.id === currentStageId;
          return (
            <li
              key={stage.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                isCurrent
                  ? 'border-brand-300 bg-brand-50'
                  : 'border-slate-200 bg-white'
              }`}
              data-testid={`pipeline-stage-row-${idx}`}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{stage.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                    {t(`company.pipeline.kinds.${stage.kind}`)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[status]}`}
                  >
                    {t(`company.pipeline.results.${status}`)}
                  </span>
                  {!stage.isRequired ? (
                    <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                      {t('company.pipeline.fields.optional')}
                    </span>
                  ) : null}
                </div>
                {stage.description ? (
                  <p className="text-xs text-slate-600">{stage.description}</p>
                ) : null}
                {result?.notes ? (
                  <p className="text-xs italic text-slate-500">“{result.notes}”</p>
                ) : null}
                {result?.score != null ? (
                  <p className="text-xs text-slate-600">
                    {t('company.pipeline.results.scoreLabel', { score: result.score })}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </div>
      ) : null}

      {canEdit ? (
        progress ? (
          progress.status === 'IN_PROGRESS' && progress.currentStageId ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  {t('company.pipeline.actions.notesLabel')}
                </label>
                <textarea
                  className="input min-h-[60px] w-full"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('company.pipeline.actions.notesPlaceholder')}
                  data-testid="pipeline-action-notes"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  {t('company.pipeline.actions.reasonLabel')}
                </label>
                <input
                  type="text"
                  className="input w-full"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('company.pipeline.actions.reasonPlaceholder')}
                  data-testid="pipeline-action-reason"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  onClick={() => onAdvance(progress.id)}
                  disabled={pending}
                  data-testid="pipeline-action-advance"
                >
                  {t('company.pipeline.actions.advance')}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                  onClick={() => onReject(progress.id)}
                  disabled={pending}
                  data-testid="pipeline-action-reject"
                >
                  {t('company.pipeline.actions.reject')}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => onSkip(progress.id)}
                  disabled={pending}
                  data-testid="pipeline-action-skip"
                >
                  {t('company.pipeline.actions.skip')}
                </button>
              </div>
            </div>
          ) : (
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              {t(`company.pipeline.statusFootnotes.${progress.status}`)}
            </div>
          )
        ) : (
          <div className="border-t border-slate-100 pt-3">
            <button
              type="button"
              className="btn-primary"
              onClick={onStart}
              disabled={pending || !pipeline.isActive}
              data-testid="pipeline-action-start"
            >
              {t('company.pipeline.actions.start')}
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}
