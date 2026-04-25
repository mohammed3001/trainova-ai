'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  CONTRACT_DOCUMENT_KINDS,
  CONTRACT_TEMPLATE_STATUSES,
  type ContractDocumentKind,
  type ContractTemplateStatus,
  type TemplateVariableInput,
} from '@trainova/shared';

interface ExistingTemplate {
  id: string;
  kind: ContractDocumentKind;
  slug: string;
  name: string;
  description: string | null;
  bodyMarkdown: string;
  locale: string;
  variables: TemplateVariableInput[];
  status: ContractTemplateStatus;
}

interface Props {
  locale: string;
  template?: ExistingTemplate;
}

export function ContractTemplateForm({ locale, template }: Props) {
  const t = useTranslations('contractDocs');
  const router = useRouter();
  const [kind, setKind] = useState<ContractDocumentKind>(template?.kind ?? 'NDA');
  const [slug, setSlug] = useState(template?.slug ?? '');
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [bodyMarkdown, setBody] = useState(template?.bodyMarkdown ?? '');
  const [templateLocale, setTemplateLocale] = useState(template?.locale ?? 'EN');
  const [status, setStatus] = useState<ContractTemplateStatus>(template?.status ?? 'DRAFT');
  const [vars, setVars] = useState<TemplateVariableInput[]>(template?.variables ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function updateVar(idx: number, patch: Partial<TemplateVariableInput>) {
    setVars((prev) => prev.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      kind,
      slug,
      name,
      description: description.trim() === '' ? undefined : description.trim(),
      bodyMarkdown,
      locale: templateLocale,
      variables: vars,
      status,
    };
    const path = template
      ? `/api/proxy/admin/contract-templates/${encodeURIComponent(template.id)}`
      : '/api/proxy/admin/contract-templates';
    const res = await fetch(path, {
      method: template ? 'PATCH' : 'POST',
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
    router.push(`/${locale}/admin/contract-templates`);
    router.refresh();
  }

  async function archive() {
    if (!template) return;
    if (!window.confirm(t('admin.confirmArchive'))) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/proxy/admin/contract-templates/${encodeURIComponent(template.id)}`,
      { method: 'DELETE', credentials: 'same-origin' },
    );
    setBusy(false);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      setError(text || t('errors.generic'));
      return;
    }
    router.push(`/${locale}/admin/contract-templates`);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('admin.field.name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={160}
            className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('admin.field.slug')}</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            required
            pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
            className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('admin.field.kind')}</span>
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
          <span className="font-medium text-slate-700">{t('admin.field.locale')}</span>
          <input
            value={templateLocale}
            onChange={(e) => setTemplateLocale(e.target.value.toUpperCase())}
            maxLength={10}
            className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-slate-700">{t('admin.field.description')}</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700">{t('admin.field.status')}</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ContractTemplateStatus)}
            className="rounded-lg border-slate-300 px-3 py-2 shadow-sm focus:border-brand-500 focus:ring-brand-500"
          >
            {CONTRACT_TEMPLATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700">{t('admin.field.body')}</span>
        <textarea
          value={bodyMarkdown}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={16}
          minLength={20}
          maxLength={50000}
          className="rounded-lg border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-brand-500 focus:ring-brand-500"
        />
        <span className="text-xs text-slate-500">{t('admin.bodyHint')}</span>
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-slate-700">
          {t('admin.variables')}
        </legend>
        {vars.length === 0 && (
          <p className="text-xs text-slate-500">{t('admin.variablesEmpty')}</p>
        )}
        <ul className="space-y-2">
          {vars.map((v, idx) => (
            <li
              key={idx}
              className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
            >
              <input
                value={v.key}
                onChange={(e) => updateVar(idx, { key: e.target.value })}
                placeholder={t('admin.varKey')}
                className="rounded-lg border-slate-300 px-3 py-2 text-sm"
                required
              />
              <input
                value={v.label}
                onChange={(e) => updateVar(idx, { label: e.target.value })}
                placeholder={t('admin.varLabel')}
                className="rounded-lg border-slate-300 px-3 py-2 text-sm"
                required
              />
              <label className="flex items-center gap-1 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={v.required ?? false}
                  onChange={(e) => updateVar(idx, { required: e.target.checked })}
                />
                {t('admin.varRequired')}
              </label>
              <button
                type="button"
                onClick={() => setVars((prev) => prev.filter((_, i) => i !== idx))}
                className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                {t('admin.varRemove')}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setVars((prev) => [...prev, { key: '', label: '', required: false }])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {t('admin.addVariable')}
        </button>
      </fieldset>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
        {template && (
          <button
            type="button"
            onClick={archive}
            disabled={busy || template.status === 'ARCHIVED'}
            className="rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('admin.archive')}
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-500/30 transition hover:from-brand-700 hover:to-brand-600 disabled:opacity-50"
        >
          {template ? t('admin.save') : t('admin.create')}
        </button>
      </div>
    </form>
  );
}
