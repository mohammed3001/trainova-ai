'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  deleteDripSequenceAction,
  updateDripSequenceAction,
} from '../../actions';

interface Props {
  sequence: { id: string; enabled: boolean };
}

export function DripActions({ sequence }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleEnabled() {
    setError(null);
    const fd = new FormData();
    fd.set('enabled', sequence.enabled ? 'false' : 'true');
    start(async () => {
      const result = await updateDripSequenceAction(sequence.id, fd);
      if (!result.ok && result.error) setError(result.error);
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(t('admin.emailMarketing.drip.confirm.delete'))) return;
    setError(null);
    start(async () => {
      const result = await deleteDripSequenceAction(sequence.id);
      if (!result.ok && result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={pending}
          className="btn-secondary disabled:opacity-50"
        >
          {sequence.enabled
            ? t('admin.emailMarketing.drip.actions.disable')
            : t('admin.emailMarketing.drip.actions.enable')}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="btn-danger disabled:opacity-50"
        >
          {t('admin.emailMarketing.drip.actions.delete')}
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
