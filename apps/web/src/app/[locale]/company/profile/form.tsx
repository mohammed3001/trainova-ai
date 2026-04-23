'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Company {
  name: string;
  websiteUrl: string | null;
  country: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  logoUrl: string | null;
}

export function CompanyProfileForm({ company }: { company: Company }) {
  const t = useTranslations();
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const [name, setName] = useState(company.name ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(company.websiteUrl ?? '');
  const [country, setCountry] = useState(company.country ?? '');
  const [industry, setIndustry] = useState(company.industry ?? '');
  const [size, setSize] = useState(company.size ?? '');
  const [description, setDescription] = useState(company.description ?? '');
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? '');

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    const payload = {
      name: name.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      country: country.trim() || undefined,
      industry: industry.trim() || undefined,
      size: size.trim() || undefined,
      description: description.trim() || undefined,
      logoUrl: logoUrl.trim() || undefined,
    };
    const res = await fetch('/api/proxy/companies/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { message?: string })?.message ?? t('common.error');
      setMsg({ kind: 'error', text: t('profile.company.saveFailed', { message }) });
      return;
    }
    setMsg({ kind: 'success', text: t('profile.company.saved') });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.company.sections.identity')}
        </h2>
        <Field label={t('profile.company.fields.name')}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            required
          />
        </Field>
        <Field label={t('profile.company.fields.websiteUrl')}>
          <input
            className="input"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </Field>
        <Field
          label={t('profile.company.fields.logoUrl')}
          help={t('profile.company.fields.logoUrlHelp')}
        >
          <input
            className="input"
            type="url"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://cdn.example.com/logo.png"
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.company.sections.details')}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t('profile.company.fields.country')}>
            <input
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label={t('profile.company.fields.industry')}>
            <input
              className="input"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              maxLength={80}
            />
          </Field>
        </div>
        <Field label={t('profile.company.fields.size')} help={t('profile.company.fields.sizeHelp')}>
          <input
            className="input"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            maxLength={40}
          />
        </Field>
        <Field
          label={t('profile.company.fields.description')}
          help={t('profile.company.fields.descriptionHelp')}
        >
          <textarea
            className="input min-h-[140px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
          />
          <div className="mt-1 text-xs text-slate-400">{description.length} / 4000</div>
        </Field>
      </section>

      {msg ? (
        <div
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-md p-3 text-sm ${
            msg.kind === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? t('common.loading') : t('profile.company.save')}
      </button>
    </form>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {help ? <p className="mt-1 text-xs text-slate-500">{help}</p> : null}
    </div>
  );
}
