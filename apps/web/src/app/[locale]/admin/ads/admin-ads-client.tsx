'use client';

import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AdCampaignStatus } from '@trainova/shared';
import type { CampaignSummary } from '../../company/ads/ads-client';

interface AdminCampaign extends CampaignSummary {
  company: { id: string; slug: string; name: string } | null;
  owner: { id: string; name: string; email: string } | null;
}

async function proxyJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function AdminAdsClient({
  initialPending,
  locale: _locale,
}: {
  initialPending: AdminCampaign[];
  locale: string;
}) {
  const t = useTranslations('admin.ads');
  const tAds = useTranslations('ads');
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [filterStatus, setFilterStatus] = useState<AdCampaignStatus | 'ALL'>('ALL');
  const [rows, setRows] = useState<AdminCampaign[]>(initialPending);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      if (tab === 'pending') {
        const list = await proxyJson<AdminCampaign[]>('/admin/ads/pending');
        setRows(list);
      } else {
        const q = filterStatus === 'ALL' ? '' : `?status=${filterStatus}`;
        const list = await proxyJson<AdminCampaign[]>(`/admin/ads/all${q}`);
        setRows(list);
      }
    } finally {
      setBusy(false);
    }
  }, [tab, filterStatus]);

  const act = useCallback(
    async (path: string, body?: unknown) => {
      await proxyJson(path, {
        method: 'POST',
        body: body ? JSON.stringify(body) : undefined,
      });
      await reload();
    },
    [reload],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            setTab('pending');
            const list = await proxyJson<AdminCampaign[]>('/admin/ads/pending');
            setRows(list);
          }}
          className={tab === 'pending' ? 'btn-primary' : 'btn-secondary'}
        >
          {t('tabs.pending')}
        </button>
        <button
          type="button"
          onClick={async () => {
            setTab('all');
            const list = await proxyJson<AdminCampaign[]>('/admin/ads/all');
            setRows(list);
          }}
          className={tab === 'all' ? 'btn-primary' : 'btn-secondary'}
        >
          {t('tabs.all')}
        </button>
        {tab === 'all' ? (
          <select
            className="input max-w-xs"
            value={filterStatus}
            onChange={async (e) => {
              const v = e.target.value as AdCampaignStatus | 'ALL';
              setFilterStatus(v);
              const q = v === 'ALL' ? '' : `?status=${v}`;
              const list = await proxyJson<AdminCampaign[]>(`/admin/ads/all${q}`);
              setRows(list);
            }}
          >
            <option value="ALL">*</option>
            {(
              [
                'DRAFT',
                'PENDING_REVIEW',
                'APPROVED',
                'ACTIVE',
                'PAUSED',
                'REJECTED',
                'ENDED',
              ] as AdCampaignStatus[]
            ).map((s) => (
              <option key={s} value={s}>
                {tAds(`status.${s}`)}
              </option>
            ))}
          </select>
        ) : null}
        {busy ? <span className="text-xs text-slate-500">…</span> : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/40">
          {t('empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => (
            <AdminRow key={c.id} campaign={c} onAction={act} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminRow({
  campaign,
  onAction,
}: {
  campaign: AdminCampaign;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const t = useTranslations('admin.ads');
  const tAds = useTranslations('ads');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <li className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {campaign.name}
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {tAds(`status.${campaign.status}`)}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {tAds(`pricing.${campaign.pricingModel}`)}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            {campaign.company?.name ?? '—'} · {campaign.owner?.email ?? '—'}
          </p>
          <p className="text-xs text-slate-500">
            {campaign.totals.impressions} / {campaign.totals.clicks} · {campaign.spentCents}¢ /{' '}
            {campaign.budgetCents}¢
          </p>
          {campaign.status === 'REJECTED' && campaign.rejectionReason ? (
            <p className="text-xs text-rose-600 dark:text-rose-300">
              {t('rejectedReason', { reason: campaign.rejectionReason })}
            </p>
          ) : null}
          {campaign.reviewedAt ? (
            <p className="text-xs text-emerald-600 dark:text-emerald-300">
              {t('approvedBy', { at: new Date(campaign.reviewedAt).toLocaleString() })}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {campaign.status === 'PENDING_REVIEW' ? (
            <>
              <button
                type="button"
                className="btn-primary"
                onClick={() => onAction(`/admin/ads/${campaign.id}/approve`)}
              >
                {t('actions.approve')}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejecting((v) => !v)}
              >
                {t('actions.reject')}
              </button>
            </>
          ) : null}
          {campaign.status === 'ACTIVE' ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onAction(`/admin/ads/${campaign.id}/pause`)}
            >
              {t('actions.pause')}
            </button>
          ) : null}
          {campaign.status === 'PAUSED' ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => onAction(`/admin/ads/${campaign.id}/resume`)}
            >
              {t('actions.resume')}
            </button>
          ) : null}
        </div>
      </div>

      {rejecting ? (
        <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/5">
          <label className="block space-y-1">
            <span className="font-medium text-amber-900 dark:text-amber-200">
              {t('rejectReasonLabel')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={4}
              maxLength={400}
              rows={2}
              className="input"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setRejecting(false)}>
              ✕
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={reason.trim().length < 4}
              onClick={async () => {
                await onAction(`/admin/ads/${campaign.id}/reject`, { reason: reason.trim() });
                setRejecting(false);
                setReason('');
              }}
            >
              {t('actions.reject')}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
