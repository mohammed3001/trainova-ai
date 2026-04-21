'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ApplyForm({ requestId }: { requestId: string }) {
  const t = useTranslations();
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [proposedTimelineDays, setProposedTimelineDays] = useState('');
  const [state, setState] = useState<{ pending: boolean; error?: string; ok?: boolean }>({ pending: false });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ pending: true });
    const res = await fetch('/api/proxy/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        coverLetter,
        proposedRate: proposedRate ? Number(proposedRate) : undefined,
        proposedTimelineDays: proposedTimelineDays ? Number(proposedTimelineDays) : undefined,
      }),
    });
    if (res.ok) {
      setState({ pending: false, ok: true });
      setCoverLetter('');
      setProposedRate('');
      setProposedTimelineDays('');
    } else {
      const body = await res.json().catch(() => ({}));
      setState({ pending: false, error: body?.message ?? 'Failed' });
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">{t('requests.apply')}</h2>
      <div>
        <label className="label">{t('requests.coverLetter')}</label>
        <textarea
          className="input min-h-[120px]"
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          required
          minLength={20}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('requests.proposedRate')}</label>
          <input
            type="number"
            min={0}
            className="input"
            value={proposedRate}
            onChange={(e) => setProposedRate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">{t('requests.proposedTimeline')}</label>
          <input
            type="number"
            min={1}
            className="input"
            value={proposedTimelineDays}
            onChange={(e) => setProposedTimelineDays(e.target.value)}
          />
        </div>
      </div>
      {state.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      {state.ok ? (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {t('requests.applied')}
        </div>
      ) : null}
      <button type="submit" disabled={state.pending} className="btn-primary w-full disabled:opacity-60">
        {state.pending ? t('common.loading') : t('common.submit')}
      </button>
    </form>
  );
}
