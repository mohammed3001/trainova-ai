'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { EmailTemplateSpec, EmailTemplateKey } from '@trainova/shared';
import {
  deleteEmailTemplateAction,
  previewEmailTemplateAction,
  updateEmailTemplateAction,
} from './actions';

export interface EditorInitial {
  id: string;
  key: EmailTemplateKey;
  locale: 'en' | 'ar';
  subject: string;
  bodyHtml: string;
  bodyText: string;
  enabled: boolean;
  description: string | null;
}

export interface EditorProps {
  initial: EditorInitial;
  spec: EmailTemplateSpec;
}

interface PreviewState {
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unresolvedVariables: string[];
}

export function TemplateEditor({ initial, spec }: EditorProps) {
  const t = useTranslations('admin.emailTemplates');
  const [subject, setSubject] = useState(initial.subject);
  const [bodyHtml, setBodyHtml] = useState(initial.bodyHtml);
  const [bodyText, setBodyText] = useState(initial.bodyText);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [description, setDescription] = useState(initial.description ?? '');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [isSaving, startSave] = useTransition();
  const [isPreviewing, startPreview] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  const variables = useMemo(
    () => [...spec.requiredVariables, ...spec.optionalVariables],
    [spec],
  );

  const [sampleVars, setSampleVars] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v, `{{sample ${v}}}`])),
  );

  const dir = initial.locale === 'ar' ? 'rtl' : 'ltr';

  function handlePreview() {
    startPreview(async () => {
      try {
        const result = await previewEmailTemplateAction(subject, bodyHtml, bodyText, sampleVars);
        setPreview(result);
        setStatus(null);
      } catch (err) {
        setStatus({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Preview failed',
        });
      }
    });
  }

  function handleSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startSave(async () => {
      const result = await updateEmailTemplateAction(initial.id, fd);
      if (result.ok) {
        setStatus({ kind: 'ok', message: t('saved') });
      } else {
        setStatus({ kind: 'error', message: result.error ?? t('saveFailed') });
      }
    });
  }

  function handleDelete() {
    if (!confirm(t('confirmDelete'))) return;
    startDelete(async () => {
      const result = await deleteEmailTemplateAction(initial.id);
      if (!result.ok) {
        setStatus({ kind: 'error', message: result.error ?? t('deleteFailed') });
      }
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="card space-y-4 bg-white/70 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('editor.meta')}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="enabled"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                {enabled ? t('enabled') : t('disabled')}
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              <div>
                <span className="font-medium text-slate-500">{t('editor.key')}:</span>{' '}
                <span className="font-mono">{initial.key}</span>
              </div>
              <div>
                <span className="font-medium text-slate-500">{t('editor.locale')}:</span>{' '}
                <span className="font-mono uppercase">{initial.locale}</span>
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.description')}</span>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="input resize-y"
                placeholder={spec.description}
              />
            </label>
          </div>

          <div className="card space-y-4 bg-white/70 backdrop-blur">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.subject')}</span>
              <input
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input"
                dir={dir}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.bodyHtml')}</span>
              <textarea
                name="bodyHtml"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={14}
                className="input font-mono text-xs"
                dir={dir}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.bodyText')}</span>
              <textarea
                name="bodyText"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={6}
                className="input font-mono text-xs"
                dir={dir}
                required
              />
            </label>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="card bg-gradient-to-br from-brand-50 to-white">
            <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
              {t('editor.variables.title')}
            </div>
            <p className="mt-1 text-xs text-slate-600">{t('editor.variables.help')}</p>
            <ul className="mt-3 space-y-2 text-xs">
              {spec.requiredVariables.map((v) => (
                <VariableRow
                  key={v}
                  name={v}
                  required
                  value={sampleVars[v] ?? ''}
                  onChange={(value) => setSampleVars({ ...sampleVars, [v]: value })}
                />
              ))}
              {spec.optionalVariables.map((v) => (
                <VariableRow
                  key={v}
                  name={v}
                  required={false}
                  value={sampleVars[v] ?? ''}
                  onChange={(value) => setSampleVars({ ...sampleVars, [v]: value })}
                />
              ))}
            </ul>
          </div>

          <div className="card bg-white/70 backdrop-blur">
            <button
              type="button"
              onClick={handlePreview}
              disabled={isPreviewing}
              className="btn-primary w-full"
            >
              {isPreviewing ? t('editor.previewing') : t('editor.preview')}
            </button>
            {preview && (
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {t('editor.previewSubject')}
                  </div>
                  <div
                    className="mt-1 rounded-md bg-slate-50 p-2 text-xs"
                    dir={dir}
                  >
                    {preview.subject}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {t('editor.previewHtml')}
                  </div>
                  <iframe
                    srcDoc={preview.bodyHtml}
                    className="mt-1 h-64 w-full rounded-md border border-slate-200 bg-white"
                    title="preview"
                    sandbox=""
                  />
                </div>
                {preview.unresolvedVariables.length > 0 && (
                  <div className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">
                    <div className="font-semibold">{t('editor.unresolved')}</div>
                    <div className="mt-1 font-mono">
                      {preview.unresolvedVariables.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {status && (
        <div
          className={`rounded-md p-3 text-sm ${
            status.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200'
              : 'bg-rose-50 text-rose-900 ring-1 ring-rose-200'
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-md border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
        >
          {isDeleting ? t('editor.deleting') : t('editor.delete')}
        </button>
        <button type="submit" disabled={isSaving} className="btn-primary">
          {isSaving ? t('editor.saving') : t('editor.save')}
        </button>
      </div>
    </form>
  );
}

function VariableRow({
  name,
  required,
  value,
  onChange,
}: {
  name: string;
  required: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <li>
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1 font-mono text-[11px] text-slate-700">
          <span className="text-slate-400">{'{{'}</span>
          {name}
          <span className="text-slate-400">{'}}'}</span>
          {required && (
            <span className="ml-auto rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] uppercase text-rose-700">
              req
            </span>
          )}
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input text-xs"
          placeholder={`{{sample ${name}}}`}
        />
      </label>
    </li>
  );
}
