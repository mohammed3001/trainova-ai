'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { validateAnswers, type AnswerMap, type ApplicationForm } from '@trainova/shared';
import { DynamicFields } from '@/components/dynamic-fields';
import { ApplicationAttachmentsPanel } from './application-attachments-panel';

interface ApplyFormProps {
  requestId: string;
  applicationSchema: ApplicationForm | null;
  locale: string;
}

export function ApplyForm({ requestId, applicationSchema, locale }: ApplyFormProps) {
  const t = useTranslations();
  const [coverLetter, setCoverLetter] = useState('');
  const [proposedRate, setProposedRate] = useState('');
  const [proposedTimelineDays, setProposedTimelineDays] = useState('');
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<{
    pending: boolean;
    error?: string;
    ok?: boolean;
    applicationId?: string;
  }>({ pending: false });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (applicationSchema) {
      const client = validateAnswers(applicationSchema, answers);
      if (!client.ok) {
        setFieldErrors(client.errors);
        setState({ pending: false, error: t('requests.answerErrors') });
        return;
      }
    }
    setFieldErrors({});
    setState({ pending: true });
    const res = await fetch('/api/proxy/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        coverLetter,
        proposedRate: proposedRate ? Number(proposedRate) : undefined,
        proposedTimelineDays: proposedTimelineDays ? Number(proposedTimelineDays) : undefined,
        answers: applicationSchema ? answers : undefined,
      }),
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { id?: string }
        | null;
      setState({
        pending: false,
        ok: true,
        applicationId: body?.id,
      });
      setCoverLetter('');
      setProposedRate('');
      setProposedTimelineDays('');
      setAnswers({});
    } else {
      const body = await res.json().catch(() => ({}));
      if (body?.fieldErrors && typeof body.fieldErrors === 'object') {
        setFieldErrors(body.fieldErrors as Record<string, string>);
      }
      setState({ pending: false, error: body?.message ?? 'Failed' });
    }
  }

  // Once the application exists, stop showing the form and surface the
  // attachments panel — the trainer can attach CV / portfolio files against
  // the freshly-created applicationId. This is the only spot where we hold
  // that id on the client side (the RSC page does not know it yet).
  if (state.ok && state.applicationId) {
    return (
      <div className="space-y-3">
        <div
          role="status"
          className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700"
          data-testid="applied-success"
        >
          {t('requests.applied')}
        </div>
        <ApplicationAttachmentsPanel
          applicationId={state.applicationId}
          canEdit
        />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3" data-testid="apply-form">
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
      {applicationSchema && applicationSchema.fields.length > 0 ? (
        <div className="space-y-2 border-t border-slate-100 pt-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('requests.customFields')}</h3>
          <DynamicFields
            schema={applicationSchema}
            values={answers}
            errors={fieldErrors}
            onChange={(id, value) =>
              setAnswers((prev) => {
                const next = { ...prev };
                if (value === '' || value === undefined) delete next[id];
                else next[id] = value;
                return next;
              })
            }
            locale={locale}
          />
        </div>
      ) : null}
      {state.error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      ) : null}
      <button type="submit" disabled={state.pending} className="btn-primary w-full disabled:opacity-60">
        {state.pending ? t('common.loading') : t('common.submit')}
      </button>
    </form>
  );
}
