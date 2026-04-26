'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type BrandingState = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  brandingEnabled: boolean;
  brandColorHex: string | null;
  accentColorHex: string | null;
  faviconUrl: string | null;
  supportEmail: string | null;
  footerNote: string | null;
  customDomain: string | null;
  customDomainVerifiedAt: string | null;
};

type VerificationInstructions = {
  domain: string;
  record: string;
  token: string;
  verifiedAt: string | null;
};

// '' is the explicit clear-value the API needs to null a column. We send
// undefined for fields the user did not change so we don't accidentally clear
// values that exist server-side but were never rendered into the form.
function urlOrEmpty(current: string, original: string | null): string | undefined {
  const trimmed = current.trim();
  if (trimmed) return trimmed;
  return original ? '' : undefined;
}

export function BrandingForm({ initial }: { initial: BrandingState }) {
  const t = useTranslations();
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [verification, setVerification] = useState<VerificationInstructions | null>(null);

  const [brandingEnabled, setBrandingEnabled] = useState(initial.brandingEnabled);
  const [brandColorHex, setBrandColorHex] = useState(initial.brandColorHex ?? '');
  const [accentColorHex, setAccentColorHex] = useState(initial.accentColorHex ?? '');
  const [faviconUrl, setFaviconUrl] = useState(initial.faviconUrl ?? '');
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail ?? '');
  const [footerNote, setFooterNote] = useState(initial.footerNote ?? '');
  const [customDomain, setCustomDomain] = useState(initial.customDomain ?? '');

  const previewStyles = useMemo(
    () => ({
      // The hex inputs are validated as strict #rgb or #rrggbb on the server,
      // but a user typing in the field briefly violates that. We let the
      // browser fall back to the default if the value is malformed.
      ['--preview-brand' as string]: brandColorHex || '#1f6feb',
      ['--preview-accent' as string]: accentColorHex || '#0ea5e9',
    }),
    [brandColorHex, accentColorHex],
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setPending(true);
    const payload = {
      brandingEnabled,
      brandColorHex: urlOrEmpty(brandColorHex, initial.brandColorHex),
      accentColorHex: urlOrEmpty(accentColorHex, initial.accentColorHex),
      faviconUrl: urlOrEmpty(faviconUrl, initial.faviconUrl),
      supportEmail: urlOrEmpty(supportEmail, initial.supportEmail),
      footerNote: urlOrEmpty(footerNote, initial.footerNote),
      customDomain: urlOrEmpty(customDomain, initial.customDomain),
    };
    const res = await fetch('/api/proxy/company/branding', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMsg({ kind: 'error', text: body.message ?? t('common.error') });
      return;
    }
    setMsg({ kind: 'success', text: t('whiteLabel.saved') });
    router.refresh();
  }

  async function loadVerification() {
    setMsg(null);
    const res = await fetch('/api/proxy/company/branding/verification', { method: 'GET' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMsg({ kind: 'error', text: body.message ?? t('common.error') });
      return;
    }
    setVerification((await res.json()) as VerificationInstructions);
  }

  async function markVerified() {
    if (!verification) return;
    setPending(true);
    setMsg(null);
    const res = await fetch(
      `/api/proxy/company/branding/verification/${encodeURIComponent(verification.token)}`,
      { method: 'POST' },
    );
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setMsg({ kind: 'error', text: body.message ?? t('common.error') });
      return;
    }
    setMsg({ kind: 'success', text: t('whiteLabel.verified') });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t('whiteLabel.sections.theme')}</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={brandingEnabled}
            onChange={(e) => setBrandingEnabled(e.target.checked)}
          />
          <span>{t('whiteLabel.fields.enabled')}</span>
        </label>
        <p className="text-xs text-slate-500">{t('whiteLabel.fields.enabledHint')}</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('whiteLabel.fields.brandColor')}>
            <div className="flex items-center gap-2">
              <input
                className="input"
                value={brandColorHex}
                onChange={(e) => setBrandColorHex(e.target.value)}
                placeholder="#1f6feb"
                maxLength={7}
              />
              <span
                aria-hidden
                className="h-9 w-9 rounded-md border border-slate-200"
                style={{ background: brandColorHex || '#1f6feb' }}
              />
            </div>
          </Field>
          <Field label={t('whiteLabel.fields.accentColor')}>
            <div className="flex items-center gap-2">
              <input
                className="input"
                value={accentColorHex}
                onChange={(e) => setAccentColorHex(e.target.value)}
                placeholder="#0ea5e9"
                maxLength={7}
              />
              <span
                aria-hidden
                className="h-9 w-9 rounded-md border border-slate-200"
                style={{ background: accentColorHex || '#0ea5e9' }}
              />
            </div>
          </Field>
        </div>
        <Field label={t('whiteLabel.fields.faviconUrl')}>
          <input
            className="input"
            type="url"
            value={faviconUrl}
            onChange={(e) => setFaviconUrl(e.target.value)}
            placeholder="https://cdn.example.com/favicon.ico"
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t('whiteLabel.sections.contact')}</h2>
        <Field label={t('whiteLabel.fields.supportEmail')}>
          <input
            className="input"
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            placeholder="support@acme.example"
          />
        </Field>
        <Field label={t('whiteLabel.fields.footerNote')}>
          <textarea
            className="input"
            rows={3}
            value={footerNote}
            onChange={(e) => setFooterNote(e.target.value)}
            maxLength={500}
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">{t('whiteLabel.sections.domain')}</h2>
        <Field label={t('whiteLabel.fields.customDomain')}>
          <input
            className="input"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            placeholder="ai.acme.example"
          />
        </Field>
        <p className="text-xs text-slate-500">
          {initial.customDomainVerifiedAt
            ? t('whiteLabel.domainVerified', { at: initial.customDomainVerifiedAt })
            : t('whiteLabel.domainUnverified')}
        </p>
        {initial.customDomain ? (
          <div className="space-y-3">
            <button type="button" className="btn-secondary" onClick={loadVerification}>
              {t('whiteLabel.actions.showInstructions')}
            </button>
            {verification ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <div>
                  <strong>{t('whiteLabel.verification.host')}:</strong> {verification.record}
                </div>
                <div>
                  <strong>{t('whiteLabel.verification.value')}:</strong>{' '}
                  <code className="font-mono">trainova-verify={verification.token}</code>
                </div>
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  onClick={markVerified}
                  disabled={pending}
                >
                  {t('whiteLabel.actions.markVerified')}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="card space-y-3" style={previewStyles}>
        <h2 className="text-lg font-semibold text-slate-900">{t('whiteLabel.sections.preview')}</h2>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            {initial.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={initial.logoUrl}
                alt={initial.name}
                className="h-10 w-10 rounded-md object-contain"
              />
            ) : (
              <div className="h-10 w-10 rounded-md bg-slate-100" />
            )}
            <div>
              <div className="font-semibold text-slate-900">{initial.name}</div>
              <div className="text-xs text-slate-500">{customDomain || '—'}</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ background: 'var(--preview-brand)' }}
            >
              {t('whiteLabel.preview.primary')}
            </span>
            <span
              className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold text-white"
              style={{ background: 'var(--preview-accent)' }}
            >
              {t('whiteLabel.preview.accent')}
            </span>
          </div>
          {footerNote ? (
            <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
              {footerNote}
            </p>
          ) : null}
        </div>
      </section>

      {msg ? (
        <p
          className={
            msg.kind === 'success'
              ? 'text-sm text-emerald-600'
              : 'text-sm text-rose-600'
          }
          role="status"
        >
          {msg.text}
        </p>
      ) : null}

      <div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
