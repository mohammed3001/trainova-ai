'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Locales } from '@trainova/shared';
import {
  addDripStepAction,
  deleteDripStepAction,
  updateDripStepAction,
} from '../../actions';

interface Step {
  id: string;
  order: number;
  delayMinutes: number;
  locale: 'en' | 'ar' | 'fr' | 'es';
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

interface Props {
  sequenceId: string;
  steps: Step[];
}

export function DripStepEditor({ sequenceId, steps }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">
        {t('admin.emailMarketing.drip.steps.title')}
      </h2>

      {steps.length === 0 && (
        <p className="text-sm text-slate-500">{t('admin.emailMarketing.drip.steps.empty')}</p>
      )}

      <ol className="space-y-3">
        {steps.map((step, idx) => (
          <li key={step.id} className="card space-y-3 bg-white/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">
                {t('admin.emailMarketing.drip.steps.indexLabel', { index: idx + 1 })}
              </h3>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t('admin.emailMarketing.drip.steps.confirmDelete'))) return;
                  setError(null);
                  start(async () => {
                    const result = await deleteDripStepAction(sequenceId, step.id);
                    if (!result.ok && result.error) setError(result.error);
                    refresh();
                  });
                }}
                className="btn-danger-ghost text-xs disabled:opacity-50"
              >
                {t('admin.emailMarketing.drip.steps.delete')}
              </button>
            </div>
            <form
              className="grid gap-3 sm:grid-cols-2"
              action={(fd) => {
                setError(null);
                start(async () => {
                  const result = await updateDripStepAction(sequenceId, step.id, fd);
                  if (!result.ok && result.error) setError(result.error);
                  refresh();
                });
              }}
            >
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t('admin.emailMarketing.drip.steps.delayMinutes')}
                <input
                  type="number"
                  name="delayMinutes"
                  defaultValue={step.delayMinutes}
                  min={0}
                  className="input"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                {t('admin.emailMarketing.fields.locale')}
                <select name="locale" defaultValue={step.locale} className="input">
                  {Locales.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                {t('admin.emailMarketing.fields.subject')}
                <input name="subject" defaultValue={step.subject} className="input" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                {t('admin.emailMarketing.fields.bodyHtml')}
                <textarea
                  name="bodyHtml"
                  defaultValue={step.bodyHtml}
                  rows={4}
                  className="input font-mono text-xs"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
                {t('admin.emailMarketing.fields.bodyText')}
                <textarea
                  name="bodyText"
                  defaultValue={step.bodyText}
                  rows={3}
                  className="input font-mono text-xs"
                />
              </label>
              <div className="sm:col-span-2 flex justify-end">
                <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
                  {t('admin.emailMarketing.save')}
                </button>
              </div>
            </form>
          </li>
        ))}
      </ol>

      <div className="card space-y-3 bg-white/70 p-4">
        <h3 className="text-base font-semibold text-slate-900">
          {t('admin.emailMarketing.drip.steps.addNew')}
        </h3>
        <form
          className="grid gap-3 sm:grid-cols-2"
          action={(fd) => {
            setError(null);
            start(async () => {
              const result = await addDripStepAction(sequenceId, fd);
              if (!result.ok && result.error) setError(result.error);
              refresh();
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {t('admin.emailMarketing.drip.steps.delayMinutes')}
            <input
              type="number"
              name="delayMinutes"
              defaultValue={
                steps.length ? (steps[steps.length - 1]?.delayMinutes ?? 0) + 60 : 0
              }
              min={0}
              required
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {t('admin.emailMarketing.fields.locale')}
            <select name="locale" defaultValue="en" className="input">
              {Locales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.subject')}
            <input name="subject" required className="input" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.bodyHtml')}
            <textarea name="bodyHtml" required rows={4} className="input font-mono text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.bodyText')}
            <textarea name="bodyText" required rows={3} className="input font-mono text-xs" />
          </label>
          <div className="sm:col-span-2 flex justify-end">
            <button type="submit" disabled={pending} className="btn-primary disabled:opacity-50">
              {t('admin.emailMarketing.drip.steps.addNew')}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}
