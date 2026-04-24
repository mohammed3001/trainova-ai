'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AD_CREATIVE_TYPES,
  AD_PLACEMENTS,
  AD_PRICING_MODELS,
  type AdCampaignStatus,
  type AdCreativeType,
  type AdPlacement,
  type AdPricingModel,
  type CreateCampaignInput,
  type CreateCreativeInput,
  type OwnerAdCampaign,
  type OwnerAdCreative,
} from '@trainova/shared';

/* ============================================================================
 * Types
 * ========================================================================== */

export type CampaignSummary = OwnerAdCampaign;
export type CreativeSummary = OwnerAdCreative;

/* ============================================================================
 * Proxy helper
 * ========================================================================== */

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ============================================================================ */

interface Props {
  initial: CampaignSummary[];
  locale: string;
}

export function AdsClient({ initial, locale }: Props) {
  const t = useTranslations('ads');
  const [rows, setRows] = useState<CampaignSummary[]>(initial);
  const [editing, setEditing] = useState<CampaignSummary | 'new' | null>(null);
  const [topupFor, setTopupFor] = useState<CampaignSummary | null>(null);
  const [topError, setTopError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const list = await proxyJson<CampaignSummary[]>(`/ads/campaigns/mine`);
    setRows(list);
  }, []);

  const onCreate = useCallback(
    async (input: CreateCampaignInput) => {
      setTopError(null);
      try {
        await proxyJson(`/ads/campaigns`, {
          method: 'POST',
          body: JSON.stringify(input),
        });
        await refresh();
        setEditing(null);
      } catch (err) {
        setTopError(t('errors.createFailed') + ' — ' + (err as Error).message);
      }
    },
    [refresh, t],
  );

  const onUpdate = useCallback(
    async (id: string, patch: Partial<CreateCampaignInput>) => {
      setTopError(null);
      try {
        await proxyJson(`/ads/campaigns/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        await refresh();
        setEditing(null);
      } catch (err) {
        setTopError(t('errors.updateFailed') + ' — ' + (err as Error).message);
      }
    },
    [refresh, t],
  );

  const onSubmit = useCallback(
    async (id: string) => {
      try {
        await proxyJson(`/ads/campaigns/${id}/submit`, { method: 'POST' });
        await refresh();
      } catch (err) {
        setTopError(t('errors.submitFailed') + ' — ' + (err as Error).message);
      }
    },
    [refresh, t],
  );

  const onPause = useCallback(
    async (id: string) => {
      await proxyJson(`/ads/campaigns/${id}/pause`, { method: 'POST' });
      await refresh();
    },
    [refresh],
  );

  const onResume = useCallback(
    async (id: string) => {
      await proxyJson(`/ads/campaigns/${id}/resume`, { method: 'POST' });
      await refresh();
    },
    [refresh],
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (!window.confirm(t('detail.confirmDelete'))) return;
      await proxyJson(`/ads/campaigns/${id}`, { method: 'DELETE' });
      await refresh();
    },
    [refresh, t],
  );

  return (
    <div className="space-y-6">
      {topError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 backdrop-blur dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
        >
          {topError}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          {t('list.header')}
        </h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setEditing('new')}
        >
          {t('list.create')}
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState onCreate={() => setEditing('new')} />
      ) : (
        <ul className="space-y-4">
          {rows.map((c) => (
            <CampaignRow
              key={c.id}
              campaign={c}
              locale={locale}
              onEdit={() => setEditing(c)}
              onSubmit={() => onSubmit(c.id)}
              onPause={() => onPause(c.id)}
              onResume={() => onResume(c.id)}
              onDelete={() => onDelete(c.id)}
              onTopup={() => setTopupFor(c)}
              onCreativeChange={refresh}
            />
          ))}
        </ul>
      )}

      {editing === 'new' ? (
        <CampaignEditor
          title={t('list.create')}
          onCancel={() => setEditing(null)}
          onSave={(input) => onCreate(input)}
        />
      ) : editing ? (
        <CampaignEditor
          title={editing.name}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(input) => onUpdate(editing.id, input)}
        />
      ) : null}

      {topupFor ? (
        <TopupDialog
          campaign={topupFor}
          onClose={() => setTopupFor(null)}
          onDone={async () => {
            setTopupFor(null);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}

/* ============================================================================
 * Empty state
 * ========================================================================== */

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('ads.empty');
  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-fuchsia-50 via-white to-amber-50 p-10 text-center shadow-sm dark:border-slate-700/60 dark:from-fuchsia-500/5 dark:via-slate-900 dark:to-amber-500/5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-amber-300/40 blur-3xl" />
      <div className="relative space-y-3">
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
          {t('title')}
        </h3>
        <p className="mx-auto max-w-md text-sm text-slate-600 dark:text-slate-300">
          {t('body')}
        </p>
        <button type="button" className="btn-primary" onClick={onCreate}>
          {t('cta')}
        </button>
      </div>
    </div>
  );
}

/* ============================================================================
 * Row
 * ========================================================================== */

function CampaignRow({
  campaign,
  locale,
  onEdit,
  onSubmit,
  onPause,
  onResume,
  onDelete,
  onTopup,
  onCreativeChange,
}: {
  campaign: CampaignSummary;
  locale: string;
  onEdit: () => void;
  onSubmit: () => void;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
  onTopup: () => void;
  onCreativeChange: () => Promise<void>;
}) {
  const t = useTranslations('ads');
  const [showCreatives, setShowCreatives] = useState(false);

  const ctr = useMemo(() => {
    const imp = campaign.totals.impressions;
    if (!imp) return '0.00%';
    return ((campaign.totals.clicks / imp) * 100).toFixed(2) + '%';
  }, [campaign.totals.clicks, campaign.totals.impressions]);

  const remaining = Math.max(campaign.budgetCents - campaign.spentCents, 0);

  return (
    <li className="glass-card rounded-3xl border border-slate-200/80 p-5 shadow-sm dark:border-slate-700/60">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {campaign.name}
            </h3>
            <StatusPill status={campaign.status} />
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {t(`pricing.${campaign.pricingModel}`)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t('list.spentOf', {
              spent: formatCents(campaign.spentCents, locale),
              budget: formatCents(campaign.budgetCents, locale),
            })}
          </p>
          {campaign.status === 'REJECTED' && campaign.rejectionReason ? (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              {t('detail.rejectionReason')}: {campaign.rejectionReason}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          {campaign.status === 'DRAFT' ? (
            <button type="button" className="btn-secondary" onClick={onEdit}>
              ✎
            </button>
          ) : null}
          {campaign.status === 'DRAFT' ? (
            <button type="button" className="btn-primary" onClick={onSubmit}>
              {t('detail.submitForReview')}
            </button>
          ) : null}
          {campaign.status === 'ACTIVE' ? (
            <button type="button" className="btn-secondary" onClick={onPause}>
              {t('detail.pause')}
            </button>
          ) : null}
          {campaign.status === 'PAUSED' ? (
            <button type="button" className="btn-primary" onClick={onResume}>
              {t('detail.resume')}
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={onTopup}>
            {t('detail.topupCta')}
          </button>
          {campaign.status !== 'ACTIVE' && campaign.status !== 'APPROVED' ? (
            <button
              type="button"
              className="btn-ghost text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
              onClick={onDelete}
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('list.impressionsLabel')} value={campaign.totals.impressions.toLocaleString(locale)} />
        <Stat label={t('list.clicksLabel')} value={campaign.totals.clicks.toLocaleString(locale)} />
        <Stat label={t('list.ctrLabel')} value={ctr} />
        <Stat
          label={t('detail.remainingBudget')}
          value={formatCents(remaining, locale)}
        />
      </div>

      <div className="mt-4">
        <button
          type="button"
          className="text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-300 dark:hover:text-brand-200"
          onClick={() => setShowCreatives((s) => !s)}
        >
          {t('list.creatives', { count: campaign.creatives.length })}
        </button>
        {showCreatives ? (
          <CreativesPanel
            campaign={campaign}
            onChanged={onCreativeChange}
          />
        ) : null}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white/70 p-3 shadow-sm dark:border-slate-700/40 dark:bg-slate-900/40">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: AdCampaignStatus }) {
  const t = useTranslations('ads.status');
  const palette: Record<AdCampaignStatus, string> = {
    DRAFT: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    PENDING_REVIEW: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200',
    APPROVED: 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-200',
    ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200',
    PAUSED: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200',
    REJECTED: 'bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200',
    ENDED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${palette[status]}`}>
      {t(status)}
    </span>
  );
}

/* ============================================================================
 * Editor
 * ========================================================================== */

function CampaignEditor({
  initial,
  title,
  onSave,
  onCancel,
}: {
  initial?: CampaignSummary;
  title: string;
  onSave: (input: CreateCampaignInput) => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useTranslations('ads');
  const [name, setName] = useState(initial?.name ?? '');
  const [pricingModel, setPricingModel] = useState<AdPricingModel>(
    initial?.pricingModel ?? 'CPM',
  );
  const [cpmCents, setCpmCents] = useState(initial?.cpmCents ? String(initial.cpmCents) : '');
  const [cpcCents, setCpcCents] = useState(initial?.cpcCents ? String(initial.cpcCents) : '');
  const [flatFeeCents, setFlatFeeCents] = useState(
    initial?.flatFeeCents ? String(initial.flatFeeCents) : '',
  );
  const [frequencyCapPerDay, setFrequencyCapPerDay] = useState(
    String(initial?.frequencyCapPerDay ?? 3),
  );
  const [targetingCountries, setTargetingCountries] = useState(
    (initial?.targetingCountries ?? []).join(','),
  );
  const [targetingLocales, setTargetingLocales] = useState(
    (initial?.targetingLocales ?? []).join(','),
  );
  const [targetingSkillIds, setTargetingSkillIds] = useState(
    (initial?.targetingSkillIds ?? []).join(','),
  );
  const [startDate, setStartDate] = useState(
    initial?.startDate ? initial.startDate.slice(0, 10) : '',
  );
  const [endDate, setEndDate] = useState(initial?.endDate ? initial.endDate.slice(0, 10) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <form
          className="space-y-4 px-6 py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const input: CreateCampaignInput = {
                name: name.trim(),
                pricingModel,
                cpmCents: pricingModel === 'CPM' ? toIntOrUndef(cpmCents) : undefined,
                cpcCents: pricingModel === 'CPC' ? toIntOrUndef(cpcCents) : undefined,
                flatFeeCents: pricingModel === 'FLAT' ? toIntOrUndef(flatFeeCents) : undefined,
                frequencyCapPerDay: Math.max(1, Number(frequencyCapPerDay) || 3),
                targetingCountries: splitCsv(targetingCountries).map((x) => x.toUpperCase()),
                targetingLocales: splitCsv(targetingLocales),
                targetingSkillIds: splitCsv(targetingSkillIds),
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
              };
              await onSave(input);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t('campaign.name')}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              className="input"
            />
          </Field>

          <Field label={t('campaign.pricingModel')}>
            <select
              value={pricingModel}
              onChange={(e) => setPricingModel(e.target.value as AdPricingModel)}
              className="input"
              disabled={Boolean(initial)}
            >
              {AD_PRICING_MODELS.map((p) => (
                <option key={p} value={p}>
                  {t(`pricing.${p}`)}
                </option>
              ))}
            </select>
          </Field>

          {pricingModel === 'CPM' ? (
            <Field label={t('campaign.cpm')}>
              <input
                type="number"
                min={1}
                value={cpmCents}
                onChange={(e) => setCpmCents(e.target.value)}
                required
                className="input"
              />
            </Field>
          ) : null}
          {pricingModel === 'CPC' ? (
            <Field label={t('campaign.cpc')}>
              <input
                type="number"
                min={1}
                value={cpcCents}
                onChange={(e) => setCpcCents(e.target.value)}
                required
                className="input"
              />
            </Field>
          ) : null}
          {pricingModel === 'FLAT' ? (
            <Field label={t('campaign.flat')}>
              <input
                type="number"
                min={1}
                value={flatFeeCents}
                onChange={(e) => setFlatFeeCents(e.target.value)}
                required
                className="input"
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t('campaign.startDate')}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input"
              />
            </Field>
            <Field label={t('campaign.endDate')}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label={t('campaign.frequencyCap')}>
            <input
              type="number"
              min={1}
              max={100}
              value={frequencyCapPerDay}
              onChange={(e) => setFrequencyCapPerDay(e.target.value)}
              className="input"
            />
          </Field>

          <Field
            label={t('campaign.targetingCountries')}
            hint={t('campaign.commaHint')}
          >
            <input
              value={targetingCountries}
              onChange={(e) => setTargetingCountries(e.target.value)}
              placeholder="US, GB, SA"
              className="input"
            />
          </Field>

          <Field label={t('campaign.targetingLocales')} hint={t('campaign.commaHint')}>
            <input
              value={targetingLocales}
              onChange={(e) => setTargetingLocales(e.target.value)}
              placeholder="en, ar"
              className="input"
            />
          </Field>

          <Field label={t('campaign.targetingSkills')} hint={t('campaign.commaHint')}>
            <input
              value={targetingSkillIds}
              onChange={(e) => setTargetingSkillIds(e.target.value)}
              className="input"
            />
          </Field>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
              ✕
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? '…' : '✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * Creatives panel (inline)
 * ========================================================================== */

function CreativesPanel({
  campaign,
  onChanged,
}: {
  campaign: CampaignSummary;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('ads');
  const [adding, setAdding] = useState(false);

  const remove = useCallback(
    async (id: string) => {
      await proxyJson(`/ads/creatives/${id}`, { method: 'DELETE' });
      await onChanged();
    },
    [onChanged],
  );

  return (
    <div className="mt-3 space-y-3 rounded-2xl border border-slate-100 bg-white/60 p-4 dark:border-slate-700/40 dark:bg-slate-900/40">
      {campaign.creatives.length === 0 ? (
        <p className="text-sm text-slate-500">{t('detail.noCreatives')}</p>
      ) : (
        <ul className="space-y-2">
          {campaign.creatives.map((cr) => (
            <li
              key={cr.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-slate-900 dark:text-white">{cr.headline}</div>
                <div className="truncate text-xs text-slate-500">
                  {cr.placements.map((p) => t(`placement.${p}`)).join(' · ')} ·{' '}
                  {cr.impressionCount} / {cr.clickCount}
                </div>
              </div>
              <button
                type="button"
                className="btn-ghost text-rose-600 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-500/10"
                onClick={() => remove(cr.id)}
              >
                {t('creative.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <CreativeEditor
          campaignId={campaign.id}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChanged();
          }}
        />
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
          {t('detail.addCreative')}
        </button>
      )}
    </div>
  );
}

function CreativeEditor({
  campaignId,
  onCancel,
  onSaved,
}: {
  campaignId: string;
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('ads');
  const [type, setType] = useState<AdCreativeType>('NATIVE');
  const [headline, setHeadline] = useState('');
  const [body, setBody] = useState('');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [assetUrl, setAssetUrl] = useState('');
  const [placements, setPlacements] = useState<AdPlacement[]>(['NATIVE_LISTING']);
  const [weight, setWeight] = useState('5');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const togglePlacement = (p: AdPlacement) => {
    setPlacements((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  return (
    <form
      className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const input: CreateCreativeInput = {
            type,
            placements,
            headline: headline.trim(),
            body: body.trim() || undefined,
            ctaLabel: ctaLabel.trim() || undefined,
            ctaUrl: ctaUrl.trim(),
            assetUrl: assetUrl.trim() || undefined,
            weight: Math.max(1, Math.min(10, Number(weight) || 1)),
            isActive,
          };
          await proxyJson(`/ads/campaigns/${campaignId}/creatives`, {
            method: 'POST',
            body: JSON.stringify(input),
          });
          await onSaved();
        } catch (err) {
          setError(t('errors.creativeFailed') + ' — ' + (err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t('creative.headline')}>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            required
            maxLength={120}
            className="input"
          />
        </Field>
        <Field label={t('creativeType.NATIVE')}>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AdCreativeType)}
            className="input"
          >
            {AD_CREATIVE_TYPES.map((ct) => (
              <option key={ct} value={ct}>
                {t(`creativeType.${ct}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('creative.body')}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={400}
          rows={2}
          className="input"
        />
      </Field>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t('creative.ctaLabel')}>
          <input
            value={ctaLabel}
            onChange={(e) => setCtaLabel(e.target.value)}
            maxLength={32}
            className="input"
          />
        </Field>
        <Field label={t('creative.ctaUrl')}>
          <input
            type="url"
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://example.com/landing"
            required
            className="input"
          />
        </Field>
      </div>
      <Field label={t('creative.assetUrl')}>
        <input
          type="url"
          value={assetUrl}
          onChange={(e) => setAssetUrl(e.target.value)}
          className="input"
        />
      </Field>

      <Field label={t('creative.placements')}>
        <div className="flex flex-wrap gap-2">
          {AD_PLACEMENTS.map((p) => {
            const on = placements.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlacement(p)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  on
                    ? 'bg-gradient-to-r from-fuchsia-500 to-amber-400 text-white shadow'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                {t(`placement.${p}`)}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t('creative.weight')}>
          <input
            type="number"
            min={1}
            max={10}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input"
          />
        </Field>
        <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          {t('creative.active')}
        </label>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
          ✕
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '…' : t('creative.save')}
        </button>
      </div>
    </form>
  );
}

/* ============================================================================
 * Top-up
 * ========================================================================== */

function TopupDialog({
  campaign,
  onClose,
  onDone,
}: {
  campaign: CampaignSummary;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const t = useTranslations('ads.topup');
  const tBase = useTranslations('ads.errors');
  const [amountCents, setAmountCents] = useState('1000');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">{t('title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        {done ? (
          <div className="space-y-3 px-6 py-5 text-sm">
            <p className="text-emerald-600 dark:text-emerald-300">{t('success')}</p>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={onDone}>
                ✓
              </button>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4 px-6 py-5"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await proxyJson(`/ads/campaigns/${campaign.id}/topup`, {
                  method: 'POST',
                  body: JSON.stringify({
                    amountCents: Math.max(500, Number(amountCents) || 0),
                    paymentMethodId: paymentMethodId.trim(),
                  }),
                });
                setDone(true);
              } catch (err) {
                setError(tBase('topupFailed') + ' — ' + (err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t('amount')}>
              <input
                type="number"
                min={500}
                step={100}
                value={amountCents}
                onChange={(e) => setAmountCents(e.target.value)}
                required
                className="input"
              />
            </Field>
            <Field label={t('paymentMethodId')} hint={t('hint')}>
              <input
                value={paymentMethodId}
                onChange={(e) => setPaymentMethodId(e.target.value)}
                placeholder="pm_…"
                required
                className="input"
              />
            </Field>

            {error ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                ✕
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? '…' : t('submit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* ============================================================================
 * Helpers
 * ========================================================================== */

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

function toIntOrUndef(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function splitCsv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function formatCents(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(cents / 100);
}
