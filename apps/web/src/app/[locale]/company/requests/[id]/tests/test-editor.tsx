'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type TaskType = 'MCQ' | 'TEXT' | 'CODE';
type ScoringMode = 'AUTO' | 'MANUAL' | 'HYBRID';

interface TaskDraft {
  id?: string;
  type: TaskType;
  prompt: string;
  options: string[];
  answerKey: string | null;
  rubricHint: string;
  maxScore: number;
  order: number;
}

interface TestDraft {
  title: string;
  description: string;
  timeLimitMin: number | null;
  passingScore: number;
  scoringMode: ScoringMode;
  tasks: TaskDraft[];
}

export interface TestEditorInitial {
  id?: string;
  title?: string;
  description?: string | null;
  timeLimitMin?: number | null;
  passingScore?: number;
  scoringMode?: string;
  tasks?: Array<{
    id?: string;
    type: string;
    prompt: string;
    options?: unknown;
    answerKey?: string | null;
    rubric?: unknown;
    maxScore?: number;
    order?: number;
  }>;
}

function toTaskType(t: string): TaskType {
  return t === 'MCQ' || t === 'TEXT' || t === 'CODE' ? t : 'TEXT';
}

function toScoringMode(t: string | undefined): ScoringMode {
  return t === 'AUTO' || t === 'MANUAL' || t === 'HYBRID' ? t : 'HYBRID';
}

function buildInitial(initial?: TestEditorInitial): TestDraft {
  return {
    title: initial?.title ?? '',
    description: initial?.description ?? '',
    timeLimitMin: initial?.timeLimitMin ?? null,
    passingScore: initial?.passingScore ?? 60,
    scoringMode: toScoringMode(initial?.scoringMode),
    tasks: (initial?.tasks ?? []).map((task, index) => {
      const optionsRaw = task.options;
      const options = Array.isArray(optionsRaw)
        ? optionsRaw.map((o) => String(o))
        : [];
      const rubric = (task.rubric ?? {}) as { hint?: string };
      return {
        id: task.id,
        type: toTaskType(task.type),
        prompt: task.prompt ?? '',
        options,
        answerKey: task.answerKey ?? null,
        rubricHint: rubric.hint ?? '',
        maxScore: task.maxScore ?? 10,
        order: task.order ?? index,
      };
    }),
  };
}

export function TestEditor({
  mode,
  requestId,
  backUrl,
  listUrl,
  initial,
}: {
  mode: 'create' | 'edit';
  requestId: string;
  backUrl: string;
  listUrl: string;
  initial?: TestEditorInitial;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<TestDraft>(() => buildInitial(initial));

  const pending = submitting || refreshing;

  function updateTask(index: number, patch: Partial<TaskDraft>) {
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.map((task, i) => (i === index ? { ...task, ...patch } : task)),
    }));
  }

  function addTask(type: TaskType) {
    setDraft((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          type,
          prompt: '',
          options: type === 'MCQ' ? ['', ''] : [],
          answerKey: null,
          rubricHint: '',
          maxScore: 10,
          order: d.tasks.length,
        },
      ],
    }));
  }

  function removeTask(index: number) {
    setDraft((d) => ({
      ...d,
      tasks: d.tasks.filter((_, i) => i !== index).map((task, i) => ({ ...task, order: i })),
    }));
  }

  function moveTask(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const target = index + dir;
      if (target < 0 || target >= d.tasks.length) return d;
      const next = [...d.tasks];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...d, tasks: next.map((task, i) => ({ ...task, order: i })) };
    });
  }

  function validate(): string | null {
    if (draft.title.trim().length < 3) return t('company.tests.errors.titleRequired');
    if (draft.tasks.length === 0) return t('company.tests.errors.noTasks');
    for (const [i, task] of draft.tasks.entries()) {
      if (task.prompt.trim().length < 3) {
        return t('company.tests.errors.promptRequired', { n: i + 1 });
      }
      if (task.type === 'MCQ') {
        const opts = task.options.map((o) => o.trim()).filter((o) => o.length > 0);
        if (opts.length < 2) return t('company.tests.errors.mcqNeedsOptions', { n: i + 1 });
        const answer = task.answerKey?.trim() ?? '';
        if (!answer || !opts.includes(answer)) {
          return t('company.tests.errors.mcqNeedsAnswer', { n: i + 1 });
        }
      }
    }
    return null;
  }

  async function submit() {
    if (submitting) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const payload = {
        ...(mode === 'create' ? { requestId } : {}),
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        timeLimitMin: draft.timeLimitMin ?? undefined,
        passingScore: draft.passingScore,
        scoringMode: draft.scoringMode,
        tasks: draft.tasks.map((task, i) => ({
          ...(task.id ? { id: task.id } : {}),
          type: task.type,
          prompt: task.prompt.trim(),
          options:
            task.type === 'MCQ'
              ? task.options.map((o) => o.trim()).filter((o) => o.length > 0)
              : [],
          answerKey: task.type === 'MCQ' ? (task.answerKey?.trim() ?? null) : null,
          rubric: task.rubricHint.trim() ? { hint: task.rubricHint.trim() } : undefined,
          maxScore: task.maxScore,
          order: i,
        })),
      };
      const url = mode === 'create' ? '/api/proxy/tests' : `/api/proxy/tests/${initial?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body?.message ?? t('company.tests.errors.generic'));
        return;
      }
      startTransition(() => {
        router.push(listUrl);
        router.refresh();
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-xs">
        <a href={backUrl} className="text-brand-600 hover:text-brand-700">
          ← {t('company.tests.backToList')}
        </a>
      </div>
      <h1 className="text-3xl font-bold text-slate-900">
        {mode === 'create' ? t('company.tests.editor.createTitle') : t('company.tests.editor.editTitle')}
      </h1>

      <section className="card space-y-3">
        <label className="block text-sm">
          <span className="text-slate-700">{t('company.tests.editor.fields.title')}</span>
          <input
            className="input mt-1"
            value={draft.title}
            maxLength={200}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            data-testid="test-title-input"
          />
        </label>
        <label className="block text-sm">
          <span className="text-slate-700">{t('company.tests.editor.fields.description')}</span>
          <textarea
            className="input mt-1 min-h-[80px]"
            value={draft.description}
            maxLength={4000}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="text-slate-700">{t('company.tests.editor.fields.timeLimitMin')}</span>
            <input
              type="number"
              min={1}
              max={480}
              className="input mt-1"
              value={draft.timeLimitMin ?? ''}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  timeLimitMin: e.target.value ? Number(e.target.value) : null,
                }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">{t('company.tests.editor.fields.passingScore')}</span>
            <input
              type="number"
              min={0}
              max={100}
              className="input mt-1"
              value={draft.passingScore}
              onChange={(e) =>
                setDraft((d) => ({ ...d, passingScore: Number(e.target.value || 0) }))
              }
            />
            <span className="mt-1 block text-xs text-slate-500">
              {t('company.tests.editor.fields.passingScoreHint')}
            </span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-700">{t('company.tests.editor.fields.scoringMode')}</span>
            <select
              className="input mt-1"
              value={draft.scoringMode}
              onChange={(e) =>
                setDraft((d) => ({ ...d, scoringMode: e.target.value as ScoringMode }))
              }
            >
              <option value="AUTO">{t('company.tests.editor.scoringMode.auto')}</option>
              <option value="MANUAL">{t('company.tests.editor.scoringMode.manual')}</option>
              <option value="HYBRID">{t('company.tests.editor.scoringMode.hybrid')}</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold text-slate-900">
            {t('company.tests.editor.tasks.heading')}
          </h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => addTask('MCQ')}
              data-testid="test-add-mcq"
            >
              {t('company.tests.editor.tasks.addMcq')}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => addTask('TEXT')}
              data-testid="test-add-text"
            >
              {t('company.tests.editor.tasks.addText')}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => addTask('CODE')}
              data-testid="test-add-code"
            >
              {t('company.tests.editor.tasks.addCode')}
            </button>
          </div>
        </div>
        {draft.tasks.length === 0 ? (
          <div className="card text-sm text-slate-500">
            {t('company.tests.editor.tasks.empty')}
          </div>
        ) : (
          <ol className="space-y-3">
            {draft.tasks.map((task, index) => (
              <li key={task.id ?? `new-${index}`} className="card space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-slate-800">
                    {t('company.tests.editor.tasks.row', { n: index + 1, type: task.type })}
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                      onClick={() => moveTask(index, -1)}
                      disabled={index === 0}
                      aria-label={t('company.tests.editor.tasks.moveUp')}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                      onClick={() => moveTask(index, 1)}
                      disabled={index === draft.tasks.length - 1}
                      aria-label={t('company.tests.editor.tasks.moveDown')}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="rounded border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
                      onClick={() => removeTask(index)}
                    >
                      {t('company.tests.editor.tasks.remove')}
                    </button>
                  </div>
                </div>
                <label className="block text-sm">
                  <span className="text-slate-700">{t('company.tests.editor.tasks.prompt')}</span>
                  <textarea
                    className="input mt-1 min-h-[70px]"
                    value={task.prompt}
                    maxLength={4000}
                    onChange={(e) => updateTask(index, { prompt: e.target.value })}
                  />
                </label>
                {task.type === 'MCQ' ? (
                  <McqEditor
                    taskIndex={index}
                    options={task.options}
                    answerKey={task.answerKey}
                    onChange={(options, answerKey) =>
                      updateTask(index, { options, answerKey })
                    }
                  />
                ) : null}
                <label className="block text-sm">
                  <span className="text-slate-700">
                    {t('company.tests.editor.tasks.rubricHint')}
                  </span>
                  <textarea
                    className="input mt-1 min-h-[50px]"
                    value={task.rubricHint}
                    maxLength={2000}
                    placeholder={t('company.tests.editor.tasks.rubricPlaceholder')}
                    onChange={(e) => updateTask(index, { rubricHint: e.target.value })}
                  />
                </label>
                <label className="block w-40 text-sm">
                  <span className="text-slate-700">
                    {t('company.tests.editor.tasks.maxScore')}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="input mt-1"
                    value={task.maxScore}
                    onChange={(e) =>
                      updateTask(index, { maxScore: Number(e.target.value || 1) })
                    }
                  />
                </label>
              </li>
            ))}
          </ol>
        )}
      </section>

      {error ? (
        <div className="rounded bg-rose-50 p-3 text-sm text-rose-700" role="alert">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="rounded-md border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          data-testid="test-save"
        >
          {pending ? t('common.loading') : t('common.save')}
        </button>
        <a
          href={listUrl}
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          {t('common.cancel')}
        </a>
      </div>
    </div>
  );
}

function McqEditor({
  taskIndex,
  options,
  answerKey,
  onChange,
}: {
  taskIndex: number;
  options: string[];
  answerKey: string | null;
  onChange: (options: string[], answerKey: string | null) => void;
}) {
  const t = useTranslations();

  function updateOption(i: number, value: string) {
    const next = options.map((o, idx) => (idx === i ? value : o));
    // If the answerKey was pointing at the old value of this option, follow
    // the edit so the association doesn't silently break.
    const newAnswer = answerKey === options[i] ? value : answerKey;
    onChange(next, newAnswer);
  }

  function removeOption(i: number) {
    const removed = options[i];
    const next = options.filter((_, idx) => idx !== i);
    const newAnswer = answerKey === removed ? null : answerKey;
    onChange(next, newAnswer);
  }

  function addOption() {
    onChange([...options, ''], answerKey);
  }

  return (
    <div className="space-y-2 rounded border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs font-medium text-slate-700">
        {t('company.tests.editor.tasks.options')}
      </div>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name={`answer-task-${taskIndex}`}
            checked={opt !== '' && answerKey === opt}
            disabled={opt === ''}
            onChange={() => onChange(options, opt)}
            aria-label={t('company.tests.editor.tasks.markCorrect')}
          />
          <input
            className="input flex-1 text-sm"
            value={opt}
            maxLength={400}
            onChange={(e) => updateOption(i, e.target.value)}
          />
          <button
            type="button"
            onClick={() => removeOption(i)}
            className="rounded border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50"
            disabled={options.length <= 2}
            aria-label={t('company.tests.editor.tasks.removeOption')}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addOption}
        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        disabled={options.length >= 10}
      >
        {t('company.tests.editor.tasks.addOption')}
      </button>
    </div>
  );
}
