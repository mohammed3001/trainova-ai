'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  cancelInterview,
  completeInterview,
  createInterview,
  listInterviews,
  rescheduleInterview,
  type InterviewMeetingDto,
} from '@/lib/interviews-api';

interface Props {
  conversationId: string;
  /** Drives whether the "Schedule" CTA appears. Trainers can still see
   *  upcoming meetings and cancel them, but cannot create or complete. */
  canSchedule: boolean;
}

type Mode = 'closed' | 'create' | 'reschedule';

/**
 * Inline interview-scheduling panel rendered between the chat header and
 * the message scroller. The collapsed state is a single banner showing
 * the next upcoming meeting (if any) plus a "Schedule" button on the
 * company side. Expanding opens the create/reschedule form and a list
 * of past meetings for context.
 *
 * State is local: results refresh on every mutation so we never serve a
 * stale view to the *acting* user. Other participants pick up the change
 * via the SYSTEM message + bell notification posted by the API.
 */
export function InterviewsPanel({ conversationId, canSchedule }: Props) {
  const t = useTranslations('chat.interviews');
  const tCommon = useTranslations('chat');
  const locale = useLocale();
  const [items, setItems] = useState<InterviewMeetingDto[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('closed');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listInterviews({ conversationId, limit: 50 });
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  }, [conversationId, t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upcoming = useMemo(
    () => (items ?? []).filter((i) => i.isUpcoming),
    [items],
  );
  const past = useMemo(
    () => (items ?? []).filter((i) => !i.isUpcoming),
    [items],
  );
  const next = upcoming[0] ?? null;

  return (
    <section
      className="border-b border-violet-200/60 bg-gradient-to-r from-violet-50/70 via-white to-brand-50/60 px-4 py-3"
      aria-label={t('title')}
      data-testid="interviews-panel"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-violet-100 text-violet-700">
          <CalendarIcon />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700">
            {t('title')}
          </p>
          {next ? (
            <p className="truncate text-sm text-slate-700" data-testid="interview-next">
              <span className="font-medium">{formatDate(next.scheduledAt, locale)}</span>
              <span className="mx-1.5 text-slate-300">•</span>
              <span>
                {next.durationMin} {t('minutes')}
              </span>
              {next.meetingUrl ? (
                <>
                  <span className="mx-1.5 text-slate-300">•</span>
                  <a
                    href={next.meetingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-violet-700 underline-offset-2 hover:underline"
                  >
                    {t('joinLink')}
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              {canSchedule ? t('emptyCompany') : t('emptyTrainer')}
            </p>
          )}
        </div>
        {canSchedule ? (
          <button
            type="button"
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
            onClick={() => {
              setEditingId(null);
              setMode('create');
            }}
            data-testid="interview-schedule-cta"
          >
            {t('scheduleCta')}
          </button>
        ) : null}
        {(items?.length ?? 0) > 0 ? (
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            {showHistory ? t('hideHistory') : t('showHistory')}
          </button>
        ) : null}
      </div>

      {loading && items === null ? (
        <p className="mt-2 text-xs text-slate-400">{tCommon('room.live')}…</p>
      ) : null}
      {error ? (
        <p
          className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
          role="status"
        >
          {error}
        </p>
      ) : null}

      {showHistory && (upcoming.length > 1 || past.length > 0) ? (
        <ul className="mt-3 space-y-1.5">
          {upcoming.slice(1).map((it) => (
            <InterviewRow
              key={it.id}
              item={it}
              onCancel={async (reason) => {
                await cancelInterview(it.id, reason);
                await refresh();
              }}
              onComplete={async () => {
                await completeInterview(it.id);
                await refresh();
              }}
              onReschedule={() => {
                setEditingId(it.id);
                setMode('reschedule');
              }}
              locale={locale}
            />
          ))}
          {past.map((it) => (
            <InterviewRow
              key={it.id}
              item={it}
              locale={locale}
              readOnly
            />
          ))}
        </ul>
      ) : null}

      {next ? (
        <div className="mt-3 rounded-lg border border-violet-100 bg-white px-3 py-2 shadow-sm">
          <InterviewRow
            item={next}
            onCancel={async (reason) => {
              await cancelInterview(next.id, reason);
              await refresh();
            }}
            onComplete={async () => {
              await completeInterview(next.id);
              await refresh();
            }}
            onReschedule={() => {
              setEditingId(next.id);
              setMode('reschedule');
            }}
            locale={locale}
            primary
          />
        </div>
      ) : null}

      {mode !== 'closed' ? (
        <InterviewForm
          mode={mode}
          existing={mode === 'reschedule' ? items?.find((i) => i.id === editingId) ?? null : null}
          onClose={() => {
            setMode('closed');
            setEditingId(null);
          }}
          onSubmit={async (form) => {
            if (mode === 'create') {
              await createInterview({
                conversationId,
                scheduledAt: form.scheduledAt,
                durationMin: form.durationMin,
                timezone: form.timezone,
                meetingUrl: form.meetingUrl || undefined,
                agenda: form.agenda || undefined,
                notes: form.notes || undefined,
              });
            } else if (editingId) {
              await rescheduleInterview(editingId, {
                scheduledAt: form.scheduledAt,
                durationMin: form.durationMin,
                timezone: form.timezone,
                meetingUrl: form.meetingUrl || null,
                agenda: form.agenda || null,
                notes: form.notes || null,
                reason: form.reason || undefined,
              });
            }
            setMode('closed');
            setEditingId(null);
            await refresh();
          }}
        />
      ) : null}
    </section>
  );
}

interface RowProps {
  item: InterviewMeetingDto;
  locale: string;
  primary?: boolean;
  readOnly?: boolean;
  onCancel?: (reason: string | undefined) => Promise<void>;
  onComplete?: () => Promise<void>;
  onReschedule?: () => void;
}

function InterviewRow({
  item,
  locale,
  primary,
  readOnly,
  onCancel,
  onComplete,
  onReschedule,
}: RowProps) {
  const t = useTranslations('chat.interviews');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const wrap = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const statusBadge = (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        item.status === 'SCHEDULED'
          ? 'bg-violet-100 text-violet-700'
          : item.status === 'COMPLETED'
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-slate-100 text-slate-500'
      }`}
    >
      {t(`status.${item.status}` as 'status.SCHEDULED')}
    </span>
  );

  return (
    <li
      className={primary ? 'space-y-1.5' : 'flex flex-wrap items-center gap-2 text-xs'}
      data-testid={`interview-row-${item.id}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {statusBadge}
        <span className={primary ? 'text-sm font-semibold text-slate-800' : 'text-slate-700'}>
          {formatDate(item.scheduledAt, locale)}
        </span>
        <span className="text-slate-400">
          {item.durationMin} {t('minutes')} • {item.timezone}
        </span>
        {item.meetingUrl ? (
          <a
            href={item.meetingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-violet-700 hover:underline"
          >
            {t('joinLink')}
          </a>
        ) : null}
      </div>
      {primary && item.agenda ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-500">{t('agenda')}:</span> {item.agenda}
        </p>
      ) : null}
      {primary && item.notes ? (
        <p className="text-xs text-slate-600">
          <span className="font-semibold text-slate-500">{t('notes')}:</span> {item.notes}
        </p>
      ) : null}
      {item.cancelReason ? (
        <p className="text-xs text-slate-500">
          <span className="font-semibold">{t('cancelledFor')}:</span> {item.cancelReason}
        </p>
      ) : null}
      {!readOnly && item.status === 'SCHEDULED' ? (
        <div className="flex flex-wrap gap-2">
          {item.canManage && onReschedule ? (
            <button
              type="button"
              className="rounded border border-violet-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              onClick={onReschedule}
              disabled={busy}
            >
              {t('reschedule')}
            </button>
          ) : null}
          {onCancel ? (
            <button
              type="button"
              className="rounded border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
              onClick={wrap(async () => {
                const reason = window.prompt(t('cancelPrompt')) ?? undefined;
                await onCancel(reason && reason.trim() ? reason.trim() : undefined);
              })}
              disabled={busy}
              data-testid={`interview-cancel-${item.id}`}
            >
              {t('cancel')}
            </button>
          ) : null}
          {item.canManage && onComplete && new Date(item.scheduledAt).getTime() <= Date.now() ? (
            <button
              type="button"
              className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              onClick={wrap(onComplete)}
              disabled={busy}
            >
              {t('markComplete')}
            </button>
          ) : null}
        </div>
      ) : null}
      {err ? (
        <p className="text-[11px] text-rose-700" role="status">
          {err}
        </p>
      ) : null}
    </li>
  );
}

interface FormState {
  scheduledAt: string;
  durationMin: number;
  timezone: string;
  meetingUrl: string;
  agenda: string;
  notes: string;
  reason: string;
}

function InterviewForm({
  mode,
  existing,
  onClose,
  onSubmit,
}: {
  mode: 'create' | 'reschedule';
  existing: InterviewMeetingDto | null;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
}) {
  const t = useTranslations('chat.interviews');
  const browserTz = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    [],
  );
  const [form, setForm] = useState<FormState>(() => {
    if (existing) {
      return {
        scheduledAt: toLocalInputValue(existing.scheduledAt),
        durationMin: existing.durationMin,
        timezone: existing.timezone,
        meetingUrl: existing.meetingUrl ?? '',
        agenda: existing.agenda ?? '',
        notes: existing.notes ?? '',
        reason: '',
      };
    }
    return {
      scheduledAt: toLocalInputValue(defaultStartingDate()),
      durationMin: 30,
      timezone: browserTz,
      meetingUrl: '',
      agenda: '',
      notes: '',
      reason: '',
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const iso = localInputToIso(form.scheduledAt);
      if (!iso) throw new Error(t('invalidDate'));
      await onSubmit({ ...form, scheduledAt: iso });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-lg border border-violet-100 bg-white p-3 shadow-sm"
      data-testid="interview-form"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {mode === 'create' ? t('newInterview') : t('rescheduleInterview')}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fields.scheduledAt')}>
          <input
            type="datetime-local"
            required
            value={form.scheduledAt}
            onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </Field>
        <Field label={t('fields.durationMin')}>
          <input
            type="number"
            min={15}
            max={240}
            step={15}
            required
            value={form.durationMin}
            onChange={(e) =>
              setForm({ ...form, durationMin: Number(e.target.value) || 30 })
            }
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </Field>
        <Field label={t('fields.timezone')}>
          <input
            type="text"
            required
            value={form.timezone}
            onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            list="interview-tz-list"
          />
          <datalist id="interview-tz-list">
            {COMMON_TZS.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </Field>
        <Field label={t('fields.meetingUrl')}>
          <input
            type="url"
            value={form.meetingUrl}
            onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })}
            placeholder="https://"
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </Field>
        <Field label={t('fields.agenda')} colSpan>
          <textarea
            rows={2}
            value={form.agenda}
            onChange={(e) => setForm({ ...form, agenda: e.target.value })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </Field>
        <Field label={t('fields.notes')} colSpan>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </Field>
        {mode === 'reschedule' ? (
          <Field label={t('fields.reason')} colSpan>
            <input
              type="text"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
          </Field>
        ) : null}
      </div>
      {error ? (
        <p
          className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700"
          role="status"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-md border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          {t('formCancel')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          data-testid="interview-form-submit"
          className="rounded-md bg-violet-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {submitting ? t('working') : mode === 'create' ? t('confirm') : t('confirmReschedule')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  colSpan,
  children,
}: {
  label: string;
  colSpan?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-slate-600 ${colSpan ? 'sm:col-span-2' : ''}`}>
      <span className="font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function formatDate(iso: string, locale: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'ar' ? 'ar' : locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function defaultStartingDate(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString();
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Convert to "YYYY-MM-DDTHH:mm" in the *browser's* local tz so the
  // datetime-local input renders correctly. The form re-converts to ISO
  // before submit using the user-selected timezone field.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

const COMMON_TZS = [
  'UTC',
  'America/Los_Angeles',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Africa/Cairo',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];
