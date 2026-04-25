'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { EmailCampaignStatus } from '@trainova/shared';
import {
  cancelCampaignAction,
  deleteCampaignAction,
  scheduleCampaignAction,
  sendCampaignNowAction,
} from '../actions';

interface Props {
  campaign: { id: string; status: EmailCampaignStatus; scheduledFor: string | null };
}

export function CampaignActions({ campaign }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<string>(
    campaign.scheduledFor
      ? new Date(campaign.scheduledFor).toISOString().slice(0, 16)
      : '',
  );

  const isDraft = campaign.status === 'DRAFT';
  const isScheduled = campaign.status === 'SCHEDULED';
  const canSendNow = isDraft || isScheduled;
  const canCancel = isScheduled;
  const canDelete = isDraft || campaign.status === 'CANCELLED' || campaign.status === 'FAILED';

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await fn();
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {canSendNow && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('admin.emailMarketing.confirm.sendNow'))) {
                run(() => sendCampaignNowAction(campaign.id));
              }
            }}
            disabled={pending}
            className="btn-primary disabled:opacity-50"
          >
            {t('admin.emailMarketing.actions.sendNow')}
          </button>
        )}
        {isDraft && (
          <button
            type="button"
            onClick={() => setShowSchedule((s) => !s)}
            className="btn-secondary"
          >
            {t('admin.emailMarketing.actions.schedule')}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('admin.emailMarketing.confirm.cancel'))) {
                run(() => cancelCampaignAction(campaign.id));
              }
            }}
            disabled={pending}
            className="btn-secondary disabled:opacity-50"
          >
            {t('admin.emailMarketing.actions.cancel')}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('admin.emailMarketing.confirm.delete'))) {
                run(() => deleteCampaignAction(campaign.id));
              }
            }}
            disabled={pending}
            className="btn-danger disabled:opacity-50"
          >
            {t('admin.emailMarketing.actions.delete')}
          </button>
        )}
      </div>

      {showSchedule && isDraft && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            className="input"
          />
          <button
            type="button"
            disabled={pending || !scheduledFor}
            onClick={() => run(() => scheduleCampaignAction(campaign.id, scheduledFor))}
            className="btn-primary disabled:opacity-50"
          >
            {t('admin.emailMarketing.actions.confirmSchedule')}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
