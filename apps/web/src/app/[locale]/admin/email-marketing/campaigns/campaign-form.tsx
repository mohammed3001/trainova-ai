'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  EmailCampaignStatuses,
  Locales,
  UserRoles,
  UserStatuses,
  type EmailCampaignStatus,
  type EmailSegment,
} from '@trainova/shared';
import { createCampaignAction, previewSegmentAction, updateCampaignAction } from '../actions';

interface CampaignDefaults {
  id?: string;
  name?: string;
  locale?: 'en' | 'ar' | 'fr' | 'es';
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  scheduledFor?: string | null;
  segment?: EmailSegment;
  status?: EmailCampaignStatus;
}

interface Props {
  mode: 'create' | 'edit';
  defaults?: CampaignDefaults;
}

const READ_ONLY_STATUSES = new Set<EmailCampaignStatus>([
  'SENDING',
  'SENT',
  'CANCELLED',
  'FAILED',
]);

export function CampaignForm({ mode, defaults }: Props) {
  const t = useTranslations();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ count: number; sample: { id: string; name: string; email: string; role: string; locale: string }[] } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const readOnly = mode === 'edit' && defaults?.status
    ? READ_ONLY_STATUSES.has(defaults.status)
    : false;

  // Track segment fields locally so we can preview before submit.
  const [segRoles, setSegRoles] = useState<string[]>(defaults?.segment?.roles ?? []);
  const [segStatuses, setSegStatuses] = useState<string[]>(defaults?.segment?.statuses ?? []);
  const [segLocales, setSegLocales] = useState<string[]>(defaults?.segment?.locales ?? []);
  const [onlyVerified, setOnlyVerified] = useState<boolean>(defaults?.segment?.onlyVerified ?? true);
  const [createdAfter, setCreatedAfter] = useState<string>(defaults?.segment?.createdAfter ?? '');
  const [createdBefore, setCreatedBefore] = useState<string>(defaults?.segment?.createdBefore ?? '');

  function buildSegment(): EmailSegment {
    const seg: EmailSegment = { onlyVerified };
    if (segRoles.length) seg.roles = segRoles as EmailSegment['roles'];
    if (segStatuses.length) seg.statuses = segStatuses as EmailSegment['statuses'];
    if (segLocales.length) seg.locales = segLocales as EmailSegment['locales'];
    seg.onlyVerified = onlyVerified;
    if (createdAfter) seg.createdAfter = new Date(createdAfter).toISOString();
    if (createdBefore) seg.createdBefore = new Date(createdBefore).toISOString();
    return seg;
  }

  async function handlePreview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const result = await previewSegmentAction(buildSegment());
      setPreview(result);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  function toggle<T extends string>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  return (
    <form
      className="space-y-6"
      action={(fd) => {
        setError(null);
        start(async () => {
          const result =
            mode === 'create'
              ? await createCampaignAction(fd)
              : await updateCampaignAction(defaults!.id!, fd);
          if (!result.ok && result.error) setError(result.error);
        });
      }}
    >
      <fieldset disabled={readOnly} className="space-y-6 disabled:opacity-60">
        <div className="card grid gap-4 bg-white/70 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.name')}
            <input
              name="name"
              required
              defaultValue={defaults?.name ?? ''}
              className="input"
              maxLength={160}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {t('admin.emailMarketing.fields.locale')}
            <select name="locale" defaultValue={defaults?.locale ?? 'en'} className="input">
              {Locales.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
            {t('admin.emailMarketing.fields.scheduledFor')}
            <input
              type="datetime-local"
              name="scheduledFor"
              defaultValue={
                defaults?.scheduledFor
                  ? new Date(defaults.scheduledFor).toISOString().slice(0, 16)
                  : ''
              }
              className="input"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.subject')}
            <input
              name="subject"
              required
              defaultValue={defaults?.subject ?? ''}
              className="input"
              maxLength={300}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.bodyHtml')}
            <textarea
              name="bodyHtml"
              required
              defaultValue={defaults?.bodyHtml ?? ''}
              rows={8}
              className="input font-mono text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-2">
            {t('admin.emailMarketing.fields.bodyText')}
            <textarea
              name="bodyText"
              required
              defaultValue={defaults?.bodyText ?? ''}
              rows={6}
              className="input font-mono text-xs"
            />
          </label>
        </div>

        <div className="card space-y-4 bg-white/70">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {t('admin.emailMarketing.segment.title')}
            </h3>
            <p className="text-xs text-slate-500">
              {t('admin.emailMarketing.segment.subtitle')}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <fieldset>
              <legend className="text-xs font-medium text-slate-600">
                {t('admin.emailMarketing.segment.roles')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {UserRoles.map((r) => (
                  <label key={r} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      name="segment.roles"
                      value={r}
                      checked={segRoles.includes(r)}
                      onChange={() => setSegRoles((prev) => toggle(prev, r))}
                    />
                    <span>{r}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-medium text-slate-600">
                {t('admin.emailMarketing.segment.statuses')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {UserStatuses.map((s) => (
                  <label key={s} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      name="segment.statuses"
                      value={s}
                      checked={segStatuses.includes(s)}
                      onChange={() => setSegStatuses((prev) => toggle(prev, s))}
                    />
                    <span>{s}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-xs font-medium text-slate-600">
                {t('admin.emailMarketing.segment.locales')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {Locales.map((l) => (
                  <label key={l} className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      name="segment.locales"
                      value={l}
                      checked={segLocales.includes(l)}
                      onChange={() => setSegLocales((prev) => toggle(prev, l))}
                    />
                    <span>{l.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                name="segment.onlyVerified"
                value="true"
                checked={onlyVerified}
                onChange={(e) => setOnlyVerified(e.target.checked)}
              />
              {t('admin.emailMarketing.segment.onlyVerified')}
            </label>
            <input
              type="hidden"
              name="segment.onlyVerified"
              value={onlyVerified ? 'true' : 'false'}
            />
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {t('admin.emailMarketing.segment.createdAfter')}
              <input
                type="datetime-local"
                name="segment.createdAfter"
                value={createdAfter ? createdAfter.slice(0, 16) : ''}
                onChange={(e) =>
                  setCreatedAfter(e.target.value ? new Date(e.target.value).toISOString() : '')
                }
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
              {t('admin.emailMarketing.segment.createdBefore')}
              <input
                type="datetime-local"
                name="segment.createdBefore"
                value={createdBefore ? createdBefore.slice(0, 16) : ''}
                onChange={(e) =>
                  setCreatedBefore(e.target.value ? new Date(e.target.value).toISOString() : '')
                }
                className="input"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing}
              className="btn-secondary"
            >
              {previewing
                ? t('admin.emailMarketing.segment.previewing')
                : t('admin.emailMarketing.segment.preview')}
            </button>
            {preview && (
              <span className="text-sm text-slate-700">
                {t('admin.emailMarketing.segment.previewCount', { count: preview.count })}
              </span>
            )}
            {previewError && (
              <span className="text-sm text-rose-600">{previewError}</span>
            )}
          </div>

          {preview && preview.sample.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-start">{t('admin.emailMarketing.segment.preview_name')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.emailMarketing.segment.preview_email')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.emailMarketing.segment.preview_role')}</th>
                    <th className="px-3 py-2 text-start">{t('admin.emailMarketing.segment.preview_locale')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map((u) => (
                    <tr key={u.id}>
                      <td className="px-3 py-2 text-slate-900">{u.name}</td>
                      <td className="px-3 py-2 text-slate-700">{u.email}</td>
                      <td className="px-3 py-2 text-slate-700">{u.role}</td>
                      <td className="px-3 py-2 uppercase text-slate-700">{u.locale}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </fieldset>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {readOnly
            ? t('admin.emailMarketing.locked')
            : t('admin.emailMarketing.editable')}
        </p>
        <button
          type="submit"
          disabled={pending || readOnly}
          className="btn-primary disabled:opacity-50"
        >
          {pending
            ? t('admin.emailMarketing.saving')
            : mode === 'create'
              ? t('admin.emailMarketing.create')
              : t('admin.emailMarketing.save')}
        </button>
      </div>
    </form>
  );
}

export const CAMPAIGN_STATUSES = EmailCampaignStatuses;
