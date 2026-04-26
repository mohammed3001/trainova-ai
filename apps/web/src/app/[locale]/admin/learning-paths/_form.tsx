'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';

type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
type Kind = 'ARTICLE' | 'LINK' | 'VIDEO' | 'REFLECTION';

interface StepRow {
  kind: Kind;
  title: string;
  body: string;
  url: string;
}

interface Initial {
  id?: string;
  slug?: string;
  title?: string;
  summary?: string;
  description?: string;
  level?: Level;
  industry?: string | null;
  estimatedHours?: number;
  isPublished?: boolean;
  steps?: StepRow[];
}

const KINDS: Kind[] = ['ARTICLE', 'LINK', 'VIDEO', 'REFLECTION'];
const LEVELS: Level[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

function makeStep(): StepRow {
  return { kind: 'ARTICLE', title: '', body: '', url: '' };
}

export function LearningPathForm({
  locale,
  initial,
}: {
  locale: string;
  initial: Initial;
}) {
  const t = useTranslations('learning');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [slug, setSlug] = useState(initial.slug ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [summary, setSummary] = useState(initial.summary ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [level, setLevel] = useState<Level>(initial.level ?? 'BEGINNER');
  const [industry, setIndustry] = useState(initial.industry ?? '');
  const [estimatedHours, setEstimatedHours] = useState(initial.estimatedHours ?? 2);
  const [steps, setSteps] = useState<StepRow[]>(
    initial.steps && initial.steps.length > 0 ? initial.steps : [makeStep()],
  );
  const [error, setError] = useState<string | null>(null);

  const editing = !!initial.id;

  function updateStep(idx: number, patch: Partial<StepRow>) {
    setSteps((s) => s.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function removeStep(idx: number) {
    setSteps((s) => (s.length === 1 ? s : s.filter((_, i) => i !== idx)));
  }

  async function submit() {
    setError(null);
    const payloadSteps = steps.map((s) => ({
      kind: s.kind,
      title: s.title,
      body: s.body,
      ...(s.kind === 'LINK' || s.kind === 'VIDEO' ? { url: s.url } : {}),
    }));
    const body = {
      slug,
      title,
      summary,
      description,
      level,
      industry: industry.trim() || undefined,
      estimatedHours: Number(estimatedHours),
      ...(editing ? {} : { steps: payloadSteps }),
    };
    try {
      if (editing) {
        const res = await fetch(`/api/proxy/admin/learning-paths/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
        const stepsRes = await fetch(
          `/api/proxy/admin/learning-paths/${initial.id}/steps`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steps: payloadSteps }),
          },
        );
        if (!stepsRes.ok) throw new Error(await stepsRes.text());
      } else {
        const res = await fetch('/api/proxy/admin/learning-paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      router.push(`/${locale}/admin/learning-paths`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(submit);
      }}
      className="space-y-5"
    >
      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.form.slug')}>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            pattern="^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$"
            className={inputCls}
          />
        </Field>
        <Field label={t('admin.form.title')}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className={inputCls}
          />
        </Field>
      </div>

      <Field label={t('admin.form.summary')}>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          required
          maxLength={160}
          className={inputCls}
        />
      </Field>

      <Field label={t('admin.form.description')}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          rows={5}
          className={inputCls}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('admin.form.level')}>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as Level)}
            className={inputCls}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`level.${l}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.form.industry')}>
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label={t('admin.form.estimatedHours')}>
          <input
            type="number"
            min={1}
            max={500}
            value={estimatedHours}
            onChange={(e) => setEstimatedHours(Number(e.target.value))}
            className={inputCls}
          />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-900">
          {t('admin.form.steps')}
        </legend>
        {steps.map((step, idx) => (
          <div
            key={idx}
            className="space-y-2 rounded-2xl border border-white/60 bg-white/60 p-3 shadow-sm"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={step.kind}
                onChange={(e) => updateStep(idx, { kind: e.target.value as Kind })}
                className={inputCls}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </select>
              <input
                placeholder={t('admin.form.stepTitle')}
                value={step.title}
                onChange={(e) => updateStep(idx, { title: e.target.value })}
                className={`${inputCls} sm:col-span-2`}
                required
              />
            </div>
            <textarea
              placeholder={t('admin.form.stepBody')}
              value={step.body}
              onChange={(e) => updateStep(idx, { body: e.target.value })}
              rows={3}
              className={inputCls}
            />
            {step.kind === 'LINK' || step.kind === 'VIDEO' ? (
              <input
                type="url"
                placeholder={t('admin.form.stepUrl')}
                value={step.url}
                onChange={(e) => updateStep(idx, { url: e.target.value })}
                className={inputCls}
                required
              />
            ) : null}
            {steps.length > 1 ? (
              <button
                type="button"
                onClick={() => removeStep(idx)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                {t('admin.actions.delete')}
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSteps((s) => [...s, makeStep()])}
          className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          + {t('admin.form.addStep')}
        </button>
      </fieldset>

      <div className="flex justify-end gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
        >
          {editing ? t('admin.actions.save') : t('admin.actions.create')}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

export function PublishToggleAndDelete({
  id,
  locale,
  isPublished,
}: {
  id: string;
  locale: string;
  isPublished: boolean;
}) {
  const t = useTranslations('learning');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function togglePublish() {
    setError(null);
    try {
      const res = await fetch(`/api/proxy/admin/learning-paths/${id}/publish`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !isPublished }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function remove() {
    if (!confirm(t('admin.actions.delete'))) return;
    setError(null);
    try {
      const res = await fetch(`/api/proxy/admin/learning-paths/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text());
      router.push(`/${locale}/admin/learning-paths`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(togglePublish)}
        className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60"
      >
        {isPublished ? t('admin.actions.unpublish') : t('admin.actions.publish')}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(remove)}
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
      >
        {t('admin.actions.delete')}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
