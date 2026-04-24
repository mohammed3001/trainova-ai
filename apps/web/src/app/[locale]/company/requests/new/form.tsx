'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  APPLICATION_FORM_SCHEMA_VERSION,
  type ApplicationForm,
} from '@trainova/shared';
import { FormBuilder } from './form-builder';

interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export function NewRequestForm({ locale, skills }: { locale: string; skills: Skill[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [applicationSchema, setApplicationSchema] = useState<ApplicationForm>({
    version: APPLICATION_FORM_SCHEMA_VERSION,
    fields: [],
  });

  function toggleSkill(slug: string) {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const invalidField = applicationSchema.fields.find(
      (f) => f.labelEn.trim().length === 0 || f.labelAr.trim().length === 0,
    );
    if (invalidField) {
      setPending(false);
      setError(t('requests.formBuilder.errors.missingLabels'));
      return;
    }

    const payload = {
      title: String(fd.get('title') ?? ''),
      description: String(fd.get('description') ?? ''),
      objective: (fd.get('objective') as string) || undefined,
      modelFamily: (fd.get('modelFamily') as string) || undefined,
      industry: (fd.get('industry') as string) || undefined,
      durationDays: fd.get('durationDays') ? Number(fd.get('durationDays')) : undefined,
      budgetMin: fd.get('budgetMin') ? Number(fd.get('budgetMin')) : undefined,
      budgetMax: fd.get('budgetMax') ? Number(fd.get('budgetMax')) : undefined,
      currency: 'USD',
      workType: String(fd.get('workType') ?? 'REMOTE'),
      skills: selected,
      applicationSchema: applicationSchema.fields.length > 0 ? applicationSchema : null,
    };
    const res = await fetch('/api/proxy/job-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.message ?? 'Failed to create request');
      return;
    }
    router.push(`/${locale}/company/dashboard`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <Field label={t('requests.fields.title')} name="title" required />
      <Field label={t('requests.fields.description')} name="description" required multiline />
      <Field label={t('requests.fields.objective')} name="objective" multiline />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('requests.fields.modelFamily')} name="modelFamily" />
        <Field label={t('requests.fields.industry')} name="industry" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field type="number" label={t('requests.fields.durationDays')} name="durationDays" />
        <Field type="number" label={t('requests.fields.budgetMin')} name="budgetMin" />
        <Field type="number" label={t('requests.fields.budgetMax')} name="budgetMax" />
      </div>
      <div>
        <label className="label">{t('requests.fields.workType')}</label>
        <select name="workType" className="input">
          <option value="REMOTE">Remote</option>
          <option value="ONSITE">Onsite</option>
          <option value="HYBRID">Hybrid</option>
        </select>
      </div>
      <div>
        <span className="label">{t('requests.fields.skills')}</span>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => {
            const active = selected.includes(s.slug);
            return (
              <button
                type="button"
                key={s.slug}
                onClick={() => toggleSkill(s.slug)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                }`}
              >
                {s.nameEn}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2 border-t border-slate-100 pt-3">
        <FormBuilder value={applicationSchema} onChange={setApplicationSchema} />
      </div>

      {error ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? t('common.loading') : t('common.submit')}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  required,
  multiline,
  type = 'text',
}: {
  label: string;
  name: string;
  required?: boolean;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {multiline ? (
        <textarea id={name} name={name} required={required} className="input min-h-[100px]" />
      ) : (
        <input id={name} name={name} type={type} required={required} className="input" />
      )}
    </div>
  );
}
