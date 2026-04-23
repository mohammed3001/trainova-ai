'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  APPLICATION_STATUS_TRANSITIONS,
  type ApplicationStatus,
} from '@trainova/shared';

const BADGE_CLASSES: Record<string, string> = {
  APPLIED: 'bg-slate-100 text-slate-700 ring-slate-200',
  SHORTLISTED: 'bg-amber-100 text-amber-800 ring-amber-200',
  TEST_ASSIGNED: 'bg-sky-100 text-sky-800 ring-sky-200',
  TEST_SUBMITTED: 'bg-sky-100 text-sky-800 ring-sky-200',
  INTERVIEW: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  OFFERED: 'bg-violet-100 text-violet-800 ring-violet-200',
  ACCEPTED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  WITHDRAWN: 'bg-slate-100 text-slate-500 ring-slate-200',
};

function statusKey(status: string): string {
  switch (status) {
    case 'APPLIED':
      return 'company.applications.status.applied';
    case 'SHORTLISTED':
      return 'company.applications.status.shortlisted';
    case 'ACCEPTED':
      return 'company.applications.status.accepted';
    case 'REJECTED':
      return 'company.applications.status.rejected';
    case 'TEST_ASSIGNED':
      return 'company.applications.status.testAssigned';
    case 'TEST_SUBMITTED':
      return 'company.applications.status.testSubmitted';
    case 'INTERVIEW':
      return 'company.applications.status.interview';
    case 'OFFERED':
      return 'company.applications.status.offered';
    case 'WITHDRAWN':
      return 'company.applications.status.withdrawn';
    default:
      return 'company.applications.status.applied';
  }
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  const cls = BADGE_CLASSES[status] ?? BADGE_CLASSES.APPLIED;
  return (
    <span
      data-testid="application-status-badge"
      data-status={status}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {t(statusKey(status))}
    </span>
  );
}

const MVP_ACTIONABLE: ApplicationStatus[] = ['SHORTLISTED', 'ACCEPTED', 'REJECTED', 'APPLIED'];

function actionKeyFor(target: string): string {
  switch (target) {
    case 'SHORTLISTED':
      return 'company.applications.actions.shortlist';
    case 'ACCEPTED':
      return 'company.applications.actions.accept';
    case 'REJECTED':
      return 'company.applications.actions.reject';
    case 'APPLIED':
      return 'company.applications.actions.revert';
    default:
      return 'company.applications.actions.change';
  }
}

function actionStyle(target: string): string {
  switch (target) {
    case 'ACCEPTED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
    case 'REJECTED':
      return 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100';
    case 'SHORTLISTED':
      return 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100';
    default:
      return 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50';
  }
}

export function StatusActions({
  applicationId,
  currentStatus,
}: {
  applicationId: string;
  currentStatus: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [target, setTarget] = useState<ApplicationStatus | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const allowed = (APPLICATION_STATUS_TRANSITIONS[currentStatus as ApplicationStatus] ?? [])
    .filter((s) => MVP_ACTIONABLE.includes(s));

  if (allowed.length === 0) {
    return (
      <div className="text-xs text-slate-400">
        {t('company.applications.terminal')}
      </div>
    );
  }

  async function submit(toStatus: ApplicationStatus) {
    setError(null);
    setSuccess(null);
    const res = await fetch(`/api/proxy/applications/${applicationId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: toStatus, note: note.trim() || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError((body as { message?: string })?.message ?? 'Request failed');
      return;
    }
    setTarget(null);
    setNote('');
    setSuccess(t('company.applications.updated'));
    startTransition(() => router.refresh());
  }

  if (target) {
    return (
      <div className="w-full space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="text-sm font-medium text-slate-800">
          {target === 'ACCEPTED' && t('company.applications.confirm.accept')}
          {target === 'REJECTED' && t('company.applications.confirm.reject')}
          {target === 'SHORTLISTED' && t('company.applications.confirm.shortlist')}
          {target === 'APPLIED' && t('company.applications.confirm.revert')}
        </div>
        <label className="block text-xs text-slate-600" htmlFor={`note-${applicationId}`}>
          {t('company.applications.note.label')}
        </label>
        <textarea
          id={`note-${applicationId}`}
          className="input min-h-[60px] text-sm"
          maxLength={500}
          value={note}
          placeholder={t('company.applications.note.placeholder')}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? (
          <div className="rounded bg-rose-50 p-2 text-xs text-rose-700">{error}</div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => submit(target)}
            className="rounded-md border border-brand-600 bg-brand-600 px-3 py-1 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {pending ? t('common.loading') : t('common.submit')}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setTarget(null);
              setNote('');
              setError(null);
            }}
            className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowed.map((s) => (
        <button
          key={s}
          type="button"
          data-testid={`application-action-${s.toLowerCase()}`}
          onClick={() => setTarget(s)}
          className={`rounded-md border px-3 py-1 text-xs font-medium transition ${actionStyle(s)}`}
        >
          {t(actionKeyFor(s))}
        </button>
      ))}
      {success ? (
        <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">{success}</span>
      ) : null}
    </div>
  );
}
