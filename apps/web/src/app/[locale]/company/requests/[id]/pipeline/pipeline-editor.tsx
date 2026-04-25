'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  PIPELINE_MAX_STAGES,
  PIPELINE_NAME_MAX,
  PIPELINE_DESCRIPTION_MAX,
  STAGE_TITLE_MAX,
  STAGE_DESCRIPTION_MAX,
  type EvaluationPipelineDto,
  type EvaluationStageKind,
} from '@trainova/shared';
import {
  createPipeline,
  replacePipelineStages,
  updatePipeline,
} from '@/lib/evaluation-pipelines-api';

interface AvailableTest {
  id: string;
  title: string;
  passingScore: number;
}

interface StageDraft {
  id?: string;
  kind: EvaluationStageKind;
  title: string;
  description: string;
  testId: string;
  passingScore: string;
  isRequired: boolean;
}

const STAGE_KINDS: EvaluationStageKind[] = ['SCREENING', 'TEST', 'INTERVIEW', 'REVIEW'];

function emptyStage(kind: EvaluationStageKind = 'SCREENING'): StageDraft {
  return {
    kind,
    title: '',
    description: '',
    testId: '',
    passingScore: '',
    isRequired: true,
  };
}

function stagesFromDto(dto: EvaluationPipelineDto): StageDraft[] {
  return dto.stages.map((s) => ({
    id: s.id,
    kind: s.kind,
    title: s.title,
    description: s.description ?? '',
    testId: s.testId ?? '',
    passingScore: s.passingScore != null ? String(s.passingScore) : '',
    isRequired: s.isRequired,
  }));
}

export function PipelineEditor({
  requestId,
  initialPipeline,
  availableTests,
}: {
  requestId: string;
  initialPipeline: EvaluationPipelineDto | null;
  availableTests: AvailableTest[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pipeline, setPipeline] = useState<EvaluationPipelineDto | null>(initialPipeline);
  const [name, setName] = useState(initialPipeline?.name ?? '');
  const [description, setDescription] = useState(initialPipeline?.description ?? '');
  const [isActive, setIsActive] = useState(initialPipeline?.isActive ?? true);
  const [stages, setStages] = useState<StageDraft[]>(
    initialPipeline ? stagesFromDto(initialPipeline) : [emptyStage('SCREENING')],
  );
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patchStage(idx: number, patch: Partial<StageDraft>) {
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function move(idx: number, dir: -1 | 1) {
    setStages((prev) => {
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      const a = next[idx];
      const b = next[swap];
      if (!a || !b) return prev;
      next[idx] = b;
      next[swap] = a;
      return next;
    });
  }

  function removeStage(idx: number) {
    setStages((prev) => prev.filter((_, i) => i !== idx));
  }

  function addStage() {
    setStages((prev) =>
      prev.length >= PIPELINE_MAX_STAGES ? prev : [...prev, emptyStage()],
    );
  }

  function buildStagesPayload() {
    return stages.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title.trim(),
      description: s.description.trim() || undefined,
      testId: s.kind === 'TEST' ? s.testId || undefined : undefined,
      passingScore:
        s.kind === 'TEST' && s.passingScore.trim() !== ''
          ? Number(s.passingScore)
          : undefined,
      isRequired: s.isRequired,
    }));
  }

  function validate(): string | null {
    if (!name.trim()) return t('company.pipeline.errors.nameRequired');
    if (stages.length === 0) return t('company.pipeline.errors.noStages');
    for (const s of stages) {
      if (!s.title.trim()) return t('company.pipeline.errors.stageTitleRequired');
      if (s.kind === 'TEST' && !s.testId) {
        return t('company.pipeline.errors.testRequired');
      }
      if (
        s.kind === 'TEST' &&
        s.passingScore.trim() !== '' &&
        (Number.isNaN(Number(s.passingScore)) ||
          Number(s.passingScore) < 0 ||
          Number(s.passingScore) > 100)
      ) {
        return t('company.pipeline.errors.passingScoreRange');
      }
    }
    return null;
  }

  function onSave() {
    setError(null);
    setOkMessage(null);
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    startTransition(async () => {
      try {
        let nextPipeline: EvaluationPipelineDto;
        if (!pipeline) {
          nextPipeline = await createPipeline({
            requestId,
            name: name.trim(),
            description: description.trim() || undefined,
            isActive,
            stages: buildStagesPayload(),
          });
        } else {
          await updatePipeline(pipeline.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            isActive,
          });
          nextPipeline = await replacePipelineStages(pipeline.id, {
            stages: buildStagesPayload(),
          });
        }
        setPipeline(nextPipeline);
        setStages(stagesFromDto(nextPipeline));
        setOkMessage(t('company.pipeline.saved'));
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('company.pipeline.fields.name')}
          </label>
          <input
            type="text"
            className="input w-full"
            value={name}
            maxLength={PIPELINE_NAME_MAX}
            onChange={(e) => setName(e.target.value)}
            data-testid="pipeline-name"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700">
            {t('company.pipeline.fields.description')}
          </label>
          <textarea
            className="input w-full"
            rows={3}
            value={description}
            maxLength={PIPELINE_DESCRIPTION_MAX}
            onChange={(e) => setDescription(e.target.value)}
            data-testid="pipeline-description"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            data-testid="pipeline-active"
          />
          {t('company.pipeline.fields.active')}
        </label>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">
            {t('company.pipeline.stages.title')}
          </h2>
          <span className="text-xs text-slate-500">
            {t('company.pipeline.stages.counter', {
              count: stages.length,
              max: PIPELINE_MAX_STAGES,
            })}
          </span>
        </div>

        {stages.map((stage, idx) => (
          <div
            key={stage.id ?? `new-${idx}`}
            className="card space-y-3"
            data-testid={`pipeline-stage-${idx}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                  {idx + 1}
                </span>
                <select
                  className="input text-xs"
                  value={stage.kind}
                  onChange={(e) =>
                    patchStage(idx, { kind: e.target.value as EvaluationStageKind })
                  }
                  data-testid={`pipeline-stage-kind-${idx}`}
                >
                  {STAGE_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`company.pipeline.kinds.${k}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  aria-label={t('company.pipeline.stages.moveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  onClick={() => move(idx, 1)}
                  disabled={idx === stages.length - 1}
                  aria-label={t('company.pipeline.stages.moveDown')}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded-md border border-rose-200 bg-white px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                  onClick={() => removeStage(idx)}
                  aria-label={t('company.pipeline.stages.remove')}
                >
                  ×
                </button>
              </div>
            </div>
            <input
              type="text"
              className="input w-full"
              placeholder={t('company.pipeline.fields.stageTitle')}
              maxLength={STAGE_TITLE_MAX}
              value={stage.title}
              onChange={(e) => patchStage(idx, { title: e.target.value })}
              data-testid={`pipeline-stage-title-${idx}`}
            />
            <textarea
              className="input w-full"
              rows={2}
              placeholder={t('company.pipeline.fields.stageDescription')}
              maxLength={STAGE_DESCRIPTION_MAX}
              value={stage.description}
              onChange={(e) => patchStage(idx, { description: e.target.value })}
            />
            {stage.kind === 'TEST' ? (
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="input"
                  value={stage.testId}
                  onChange={(e) => patchStage(idx, { testId: e.target.value })}
                  data-testid={`pipeline-stage-test-${idx}`}
                >
                  <option value="">{t('company.pipeline.fields.selectTest')}</option>
                  {availableTests.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.title}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className="input"
                  min={0}
                  max={100}
                  value={stage.passingScore}
                  onChange={(e) => patchStage(idx, { passingScore: e.target.value })}
                  placeholder={t('company.pipeline.fields.passingScoreOverride')}
                  data-testid={`pipeline-stage-pass-${idx}`}
                />
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={stage.isRequired}
                onChange={(e) => patchStage(idx, { isRequired: e.target.checked })}
              />
              {t('company.pipeline.fields.required')}
            </label>
          </div>
        ))}

        <button
          type="button"
          className="rounded-md border border-dashed border-brand-400 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
          onClick={addStage}
          disabled={stages.length >= PIPELINE_MAX_STAGES}
          data-testid="pipeline-add-stage"
        >
          + {t('company.pipeline.stages.add')}
        </button>
      </section>

      {error ? (
        <div className="card border-rose-200 bg-rose-50 text-sm text-rose-800" role="alert">
          {error}
        </div>
      ) : null}
      {okMessage ? (
        <div
          className="card border-emerald-200 bg-emerald-50 text-sm text-emerald-800"
          role="status"
        >
          {okMessage}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={pending}
          data-testid="pipeline-save"
        >
          {pending ? t('company.pipeline.saving') : t('company.pipeline.save')}
        </button>
      </div>
    </div>
  );
}
