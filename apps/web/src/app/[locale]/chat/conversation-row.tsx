import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ConversationSummary } from '@/lib/chat-api';

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diffMs < min) return locale === 'ar' ? 'الآن' : 'now';
  if (diffMs < hour) {
    const n = Math.floor(diffMs / min);
    return locale === 'ar' ? `منذ ${n} د` : `${n}m ago`;
  }
  if (diffMs < day) {
    const n = Math.floor(diffMs / hour);
    return locale === 'ar' ? `منذ ${n} س` : `${n}h ago`;
  }
  return new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en');
}

export async function ConversationRow({
  locale,
  conv,
}: {
  locale: string;
  conv: ConversationSummary;
}) {
  const t = await getTranslations('chat');
  const name = conv.otherParticipant?.name ?? t('hub.unknownUser');
  const role = conv.otherParticipant?.role ?? '';
  const snippet =
    conv.lastMessage?.type === 'FILE'
      ? t('hub.attachment')
      : (conv.lastMessage?.body ?? t('hub.noMessagesYet'));

  return (
    <li>
      <Link
        href={`/${locale}/chat/${conv.id}`}
        data-testid={`conv-row-${conv.id}`}
        data-unread={conv.unread}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-brand-50/50"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 text-sm font-semibold text-white shadow-sm">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">{name}</span>
            {role ? (
              <span className="truncate text-[11px] uppercase tracking-wide text-slate-400">
                {t(`role.${role}` as 'role.TRAINER')}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-slate-400">
              {conv.lastMessage ? relativeTime(conv.lastMessage.createdAt, locale) : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p className="truncate text-sm text-slate-500" data-testid="conv-snippet">
              {snippet}
            </p>
            {conv.unread > 0 ? (
              <span
                className="ml-auto inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white"
                data-testid="conv-unread"
              >
                {conv.unread}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
