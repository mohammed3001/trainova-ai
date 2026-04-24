'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

interface Props {
  otherUserId: string;
  requestId?: string;
  /** Translation key under `chat.*` to use as label. Defaults to `chat.startChat`. */
  labelKey?: string;
  variant?: 'primary' | 'secondary';
  dataTestId?: string;
}

export function StartChatButton({
  otherUserId,
  requestId,
  labelKey = 'startChat',
  variant = 'secondary',
  dataTestId,
}: Props) {
  const locale = useLocale();
  const t = useTranslations('chat');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/proxy/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otherUserId, requestId }),
      });
      if (!res.ok) {
        setError(t('startFailed'));
        setBusy(false);
        return;
      }
      const body = (await res.json()) as { id: string };
      router.push(`/${locale}/chat/${body.id}`);
    } catch {
      setError(t('startFailed'));
      setBusy(false);
    }
  };

  const cls = variant === 'primary' ? 'btn-primary' : 'btn-secondary';

  return (
    <div className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className={cls}
        data-testid={dataTestId ?? 'start-chat'}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          className="h-4 w-4"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 1 1-17.8 1.66L3 21l7.34-.2A9 9 0 0 1 21 12Z" />
        </svg>
        {busy ? t('starting') : t(labelKey as 'startChat')}
      </button>
      {error ? <span className="text-[11px] text-red-600">{error}</span> : null}
    </div>
  );
}
