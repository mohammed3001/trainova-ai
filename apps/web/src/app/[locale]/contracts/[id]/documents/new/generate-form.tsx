'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  CONTRACT_DOCUMENT_KINDS,
  type ContractDocumentKind,
  type TemplateVariableInput,
} from '@trainova/shared';

interface PublishedTemplate {
  id: string;
  kind: ContractDocumentKind;
  slug: string;
  name: string;
  bodyMarkdown: string;
  locale: string;
  variables: TemplateVariableInput[];
}

interface Props {
  locale: string;
  contractId: string;
  templates: PublishedTemplate[];
}

type Mode = 'template' | 'custom';

export function GenerateDocumentForm({ locale, contractId, templates }: Props) {
  const t = useTranslations('contractDocs');
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(templates.length > 0 ? 'template' : 'custom');
  const [templateId, setTemplateId] = useState<string>(templates[0]?.id ?? '');
  const [kind, setKind] = useState<ContractDocumentKind>('NDA');
  const [title, setTitle] = useState('');
  const [bodyMarkdown, setBody] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedTemplate = useMemo(
    () => templates.find((p) => p.id === templateId) ?? null,
    [templateId, templates],
  );

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const payload =
      mode === 'template'
        ? {
            contractId,
            templateId,
            kind: selectedTemplate?.kind ?? 'CUSTOM',
            title,
            variables: vars,
            ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          }
        : {
            contractId,
            kind,
            title,
            bodyMarkdown,
            ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
          };
    const res = await fetch('/api/proxy/contract-documents', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(text || t('errors.generic'));
      return;
    }
    const created = (await res.json().catch(() => null)) as { id?: string } | null;
    if (created?.id) {
      router.push(`/${locale}/contracts/${contractId}/documents/${created.id}`);
    } else {
      router.push(`/${locale}/contracts/${contractId}/documents`);
    }
    router.refresh();
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
    >
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode('template')}
          disabled={templates.length === 0}
          className={`rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-inset transition ${
            mode === 'template'
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white ring-brand-500 shadow-sm'
              : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {t('generate.modeTemplate')}
        </button>
        <button
          type="button"
          onClick={() => setMode('custom')}
          className={`rounded-xl px-4 py-2 text-sm font-medium ring-1 ring-inset transition ${
            mode === 'custom'
              ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white ring-brand-500 shadow-sm'
              : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
          }`}
        >
          {t('generate.modeCustom')}
        </button>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{t('generate.field.title')}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={2}
          maxLength={200}
          className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
      </label>

      {mode === 'template' ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{t('generate.field.template')}</span>
            <select
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                setVars({});
              }}
              className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
            >
              {templates.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.kind} · {p.locale}
                </option>
              ))}
            </select>
          </label>

          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <fieldset className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <legend className="px-1 text-sm font-medium text-slate-700">
                {t('generate.variables')}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedTemplate.variables.map((v) => (
                  <label key={v.key} className="flex flex-col gap-1 text-sm">
                    <span className="text-slate-700">
                      {v.label}
                      {v.required ? <span className="text-rose-600"> *</span> : null}
                    </span>
                    <input
                      value={vars[v.key] ?? v.defaultValue ?? ''}
                      onChange={(e) =>
                        setVars((prev) => ({ ...prev, [v.key]: e.target.value }))
                      }
                      required={v.required ?? false}
                      maxLength={2000}
                      className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {selectedTemplate && (
            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-slate-700">
                {t('generate.previewBody')}
              </summary>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs text-slate-600">
                {selectedTemplate.bodyMarkdown}
              </pre>
            </details>
          )}
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{t('generate.field.kind')}</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContractDocumentKind)}
              className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
            >
              {CONTRACT_DOCUMENT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700">{t('generate.field.body')}</span>
            <textarea
              value={bodyMarkdown}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={16}
              minLength={20}
              maxLength={50000}
              className="rounded-lg border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{t('generate.field.expiresAt')}</span>
        <input
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500 sm:max-w-xs"
        />
      </label>

      <div className="flex items-center justify-end border-t border-slate-200 pt-4">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 disabled:opacity-50"
        >
          {t('generate.submit')}
        </button>
      </div>
    </form>
  );
}
