import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { ApiError } from '@/lib/api';
import type { ChatMessage, ConversationDetail } from '@/lib/chat-api';
import { ChatRoom } from './chat-room';

export const dynamic = 'force-dynamic';

interface MeResponse {
  id: string;
  name: string;
  role: string;
}

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations('chat');
  const token = await getToken();
  if (!token) redirect(`/${locale}/login`);

  let conversation: ConversationDetail;
  let messages: ChatMessage[];
  let me: MeResponse;
  try {
    [conversation, messages, me] = await Promise.all([
      authedFetch<ConversationDetail>(`/chat/conversations/${id}`),
      authedFetch<ChatMessage[]>(`/chat/conversations/${id}/messages`),
      authedFetch<MeResponse>('/auth/me'),
    ]);
  } catch (err) {
    const e = err as ApiError;
    if (e.status === 404 || e.status === 403) notFound();
    throw err;
  }

  const other = conversation.participants.find((p) => p.userId !== me.id);
  const otherName = other?.user.name ?? t('hub.unknownUser');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/chat`}
          className="text-sm text-slate-500 hover:text-brand-700"
          data-testid="chat-back"
        >
          ← {t('room.back')}
        </Link>
        {conversation.request ? (
          <Link
            href={`/${locale}/requests/${conversation.request.slug}`}
            className="ml-auto truncate text-xs text-slate-500 hover:text-brand-700"
          >
            {conversation.request.title}
          </Link>
        ) : null}
      </div>
      <ChatRoom
        key={conversation.id}
        conversationId={conversation.id}
        currentUserId={me.id}
        otherName={otherName}
        otherRole={other?.user.role ?? ''}
        initialMessages={messages}
        initialOtherLastReadAt={other?.lastReadAt ?? null}
      />
    </div>
  );
}
