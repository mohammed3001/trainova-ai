'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SPONSORED_WEIGHT_DEFAULT,
  SPONSORED_WEIGHT_MAX,
  SPONSORED_WEIGHT_MIN,
  type AdminCreateSponsoredInput,
  type AdminUpdateSponsoredInput,
  type SponsoredKind,
  type SponsoredPlacementDTO,
  type SponsoredPlacementList,
  type SponsoredStatus,
} from '@trainova/shared';

const KINDS: SponsoredKind[] = ['TRAINER', 'JOB_REQUEST'];
const STATUSES: SponsoredStatus[] = [
  'DRAFT',
  'PENDING_PAYMENT',
  'ACTIVE',
  'PAUSED',
  'EXPIRED',
  'REJECTED',
];

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

interface Filters {
  kind: SponsoredKind | 'ALL';
  status: SponsoredStatus | 'ALL';
  q: string;
}

function buildQuery(f: Filters, offset: number): string {
  const params = new URLSearchParams();
  if (f.kind !== 'ALL') params.set('kind', f.kind);
  if (f.status !== 'ALL') params.set('status', f.status);
  if (f.q.trim()) params.set('q', f.q.trim());
  params.set('limit', '25');
  params.set('offset', String(offset));
  return params.toString();
}

/**
 * Admin sponsored-placements grid. Self-contained CRUD client island —
 * the parent server component only seeds the first page so first paint
 * stays SSR-friendly. Every mutation (`grant`, `update`, `delete`) is
 * followed by a fresh `list` round trip so the denormalised
 * `sponsoredUntil` mirrors the user sees in the public listings can't
 * drift behind the placement state shown here.
 */
export function AdminSponsoredClient({ initial }: { initial: SponsoredPlacementList }) {
  const t = useTranslations('admin.sponsored');
  const tStatus = useTranslations('admin.sponsored.status');

  const [items, setItems] = useState<SponsoredPlacementDTO[]>(initial.items);
  const [total, setTotal] = useState(initial.total);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    kind: 'ALL',
    status: 'ALL',
    q: '',
  });
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SponsoredPlacementDTO | null>(null);

  const reload = useCallback(
    async (nextOffset = offset) => {
      setBusy(true);
      setError(null);
      try {
        const data = await proxyJson<SponsoredPlacementList>(
          `/admin/sponsored?${buildQuery(filters, nextOffset)}`,
        );
        setItems(data.items);
        setTotal(data.total);
        setOffset(nextOffset);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [filters, offset],
  );

  const handleDelete = useCallback(
    async (row: SponsoredPlacementDTO) => {
      if (!window.confirm(t('confirmDelete'))) return;
      setBusy(true);
      setError(null);
      try {
        await proxyJson(`/admin/sponsored/${row.id}`, { method: 'DELETE' });
        await reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setBusy(false);
      }
    },
    [reload, t],
  );

  const totalPages = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.floor(offset / 25) + 1;

  return (
    <div className="space-y-5">
      <FilterBar
        filters={filters}
        onChange={(next) => setFilters(next)}
        onApply={() => reload(0)}
        onCreate={() => setShowCreate(true)}
        busy={busy}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('cols.subject')}</th>
              <th className="px-4 py-3">{t('cols.kind')}</th>
              <th className="px-4 py-3">{t('cols.owner')}</th>
              <th className="px-4 py-3">{t('cols.weight')}</th>
              <th className="px-4 py-3">{t('cols.window')}</th>
              <th className="px-4 py-3">{t('cols.status')}</th>
              <th className="px-4 py-3">{t('cols.source')}</th>
              <th className="px-4 py-3 text-end">{t('cols.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-slate-200/70 align-top transition hover:bg-brand-50/30"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.subjectLabel}</div>
                    {row.subjectSlug ? (
                      <div className="text-xs text-slate-500">{row.subjectSlug}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t(`kind.${row.kind}`)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700">{row.ownerName}</div>
                    <div className="text-xs text-slate-500">{row.ownerEmail}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-700">{row.weight}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div>{new Date(row.startsAt).toLocaleString()}</div>
                    <div>→ {new Date(row.endsAt).toLocaleString()}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={row.status} label={tStatus(row.status)} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {t(`source.${row.source}`)}
                    {row.pricedCents > 0 ? (
                      <div className="text-slate-500">
                        {(row.pricedCents / 100).toFixed(2)} {row.currency}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(row)}
                        className="btn-secondary text-xs"
                        disabled={busy}
                      >
                        {t('actions.edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        className="text-xs font-medium text-rose-600 underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={busy}
                      >
                        {t('actions.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t('pagination.summary', { page: currentPage, pages: totalPages, total })}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => reload(Math.max(0, offset - 25))}
            disabled={busy || offset === 0}
            className="btn-secondary text-xs"
          >
            {t('pagination.prev')}
          </button>
          <button
            type="button"
            onClick={() => reload(offset + 25)}
            disabled={busy || offset + 25 >= total}
            className="btn-secondary text-xs"
          >
            {t('pagination.next')}
          </button>
        </div>
      </div>

      {showCreate ? (
        <CreateModal
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await reload(0);
          }}
        />
      ) : null}

      {editing ? (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      ) : null}
    </div>
  );
}

// =====================================================================
// Filter bar
// =====================================================================

function FilterBar({
  filters,
  onChange,
  onApply,
  onCreate,
  busy,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onApply: () => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const t = useTranslations('admin.sponsored');
  const tStatus = useTranslations('admin.sponsored.status');
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur">
      <label className="flex flex-col text-xs text-slate-600">
        {t('filters.kind')}
        <select
          className="input mt-1 max-w-[12rem]"
          value={filters.kind}
          onChange={(e) =>
            onChange({ ...filters, kind: e.target.value as Filters['kind'] })
          }
        >
          <option value="ALL">{t('filters.all')}</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`kind.${k}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-600">
        {t('filters.status')}
        <select
          className="input mt-1 max-w-[12rem]"
          value={filters.status}
          onChange={(e) =>
            onChange({ ...filters, status: e.target.value as Filters['status'] })
          }
        >
          <option value="ALL">{t('filters.all')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-1 flex-col text-xs text-slate-600">
        {t('filters.search')}
        <input
          className="input mt-1"
          placeholder={t('filters.searchPlaceholder')}
          value={filters.q}
          onChange={(e) => onChange({ ...filters, q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply();
          }}
        />
      </label>
      <button
        type="button"
        className="btn-secondary"
        onClick={onApply}
        disabled={busy}
      >
        {t('filters.apply')}
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={onCreate}
        disabled={busy}
      >
        {t('actions.grant')}
      </button>
    </div>
  );
}

// =====================================================================
// Status pill
// =====================================================================

function StatusPill({ status, label }: { status: SponsoredStatus; label: string }) {
  const tone: Record<SponsoredStatus, string> = {
    DRAFT: 'bg-slate-100 text-slate-600 ring-slate-300/40',
    PENDING_PAYMENT: 'bg-amber-50 text-amber-700 ring-amber-300/50',
    ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-400/50',
    PAUSED: 'bg-blue-50 text-blue-700 ring-blue-300/50',
    EXPIRED: 'bg-slate-100 text-slate-500 ring-slate-300/40',
    REJECTED: 'bg-rose-50 text-rose-700 ring-rose-300/50',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${tone[status]}`}
    >
      {label}
    </span>
  );
}

// =====================================================================
// Create modal — admin grant (no payment)
// =====================================================================

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations('admin.sponsored');
  const [kind, setKind] = useState<SponsoredKind>('TRAINER');
  const [trainerProfileId, setTrainerProfileId] = useState('');
  const [jobRequestId, setJobRequestId] = useState('');
  const [weight, setWeight] = useState<number>(SPONSORED_WEIGHT_DEFAULT);
  const [endsAt, setEndsAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 16);
  });
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const body: AdminCreateSponsoredInput = {
        kind,
        weight,
        endsAt: new Date(endsAt).toISOString(),
        ...(kind === 'TRAINER'
          ? { trainerProfileId: trainerProfileId.trim() }
          : { jobRequestId: jobRequestId.trim() }),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await proxyJson('/admin/sponsored', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [endsAt, jobRequestId, kind, notes, onCreated, trainerProfileId, weight]);

  return (
    <ModalShell title={t('create.title')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('fields.kind')}>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as SponsoredKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kind.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        {kind === 'TRAINER' ? (
          <Field label={t('fields.trainerProfileId')} hint={t('fields.idHint')}>
            <input
              className="input"
              value={trainerProfileId}
              onChange={(e) => setTrainerProfileId(e.target.value)}
              spellCheck={false}
            />
          </Field>
        ) : (
          <Field label={t('fields.jobRequestId')} hint={t('fields.idHint')}>
            <input
              className="input"
              value={jobRequestId}
              onChange={(e) => setJobRequestId(e.target.value)}
              spellCheck={false}
            />
          </Field>
        )}
        <Field
          label={t('fields.weight')}
          hint={t('fields.weightHint', {
            min: SPONSORED_WEIGHT_MIN,
            max: SPONSORED_WEIGHT_MAX,
          })}
        >
          <input
            type="number"
            className="input"
            min={SPONSORED_WEIGHT_MIN}
            max={SPONSORED_WEIGHT_MAX}
            value={weight}
            onChange={(e) =>
              setWeight(
                Math.max(
                  SPONSORED_WEIGHT_MIN,
                  Math.min(SPONSORED_WEIGHT_MAX, Number(e.target.value) || 0),
                ),
              )
            }
          />
        </Field>
        <Field label={t('fields.endsAt')}>
          <input
            type="datetime-local"
            className="input"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
        <Field label={t('fields.notes')}>
          <textarea
            className="input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </div>
      {error ? (
        <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          {t('actions.cancel')}
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={submit}
          disabled={
            busy ||
            (kind === 'TRAINER' ? !trainerProfileId.trim() : !jobRequestId.trim()) ||
            !endsAt
          }
        >
          {t('actions.grant')}
        </button>
      </div>
    </ModalShell>
  );
}

// =====================================================================
// Edit modal — adjust weight / status / window / notes
// =====================================================================

function EditModal({
  row,
  onClose,
  onSaved,
}: {
  row: SponsoredPlacementDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.sponsored');
  const tStatus = useTranslations('admin.sponsored.status');

  const initialEndsAt = useMemo(
    () => new Date(row.endsAt).toISOString().slice(0, 16),
    [row.endsAt],
  );
  const [weight, setWeight] = useState<number>(row.weight);
  const [status, setStatus] = useState<SponsoredStatus>(row.status);
  const [endsAt, setEndsAt] = useState<string>(initialEndsAt);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const patch: AdminUpdateSponsoredInput = {};
      if (weight !== row.weight) patch.weight = weight;
      if (status !== row.status) patch.status = status;
      if (endsAt !== initialEndsAt) patch.endsAt = new Date(endsAt).toISOString();
      const trimmedNotes = notes.trim();
      const original = (row.notes ?? '').trim();
      if (trimmedNotes !== original) {
        patch.notes = trimmedNotes ? trimmedNotes : null;
      }
      if (Object.keys(patch).length === 0) {
        onClose();
        return;
      }
      await proxyJson(`/admin/sponsored/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }, [endsAt, initialEndsAt, notes, onClose, onSaved, row, status, weight]);

  return (
    <ModalShell title={t('edit.title', { subject: row.subjectLabel })} onClose={onClose}>
      <div className="space-y-3">
        <Field
          label={t('fields.weight')}
          hint={t('fields.weightHint', {
            min: SPONSORED_WEIGHT_MIN,
            max: SPONSORED_WEIGHT_MAX,
          })}
        >
          <input
            type="number"
            className="input"
            min={SPONSORED_WEIGHT_MIN}
            max={SPONSORED_WEIGHT_MAX}
            value={weight}
            onChange={(e) =>
              setWeight(
                Math.max(
                  SPONSORED_WEIGHT_MIN,
                  Math.min(SPONSORED_WEIGHT_MAX, Number(e.target.value) || 0),
                ),
              )
            }
          />
        </Field>
        <Field label={t('fields.status')}>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as SponsoredStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {tStatus(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('fields.endsAt')}>
          <input
            type="datetime-local"
            className="input"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
        <Field label={t('fields.notes')}>
          <textarea
            className="input min-h-[80px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </Field>
      </div>
      {error ? (
        <div role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
          {t('actions.cancel')}
        </button>
        <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
          {t('actions.save')}
        </button>
      </div>
    </ModalShell>
  );
}

// =====================================================================
// Modal shell + field row
// =====================================================================

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/60 bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

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
    <label className="flex flex-col text-sm text-slate-700">
      <span className="mb-1 font-medium">{label}</span>
      {children}
      {hint ? <span className="mt-1 text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
