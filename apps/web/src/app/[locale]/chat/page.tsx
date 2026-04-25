import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { ConversationSummary } from '@/lib/chat-api';
import { ConversationRow } from './conversation-row';
import { ChatSearchBar } from './search-bar';

export const dynamic = 'force-dynamic';

export default async function ChatHubPage() {
  const locale = await getLocale();
  const t = await getTranslations('chat');
  const token = await getToken();
  if (!token) redirect(`/${locale}/login`);

  const conversations = await authedFetch<ConversationSummary[]>(
    '/chat/conversations',
  ).catch(() => []);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-3xl font-bold tracking-tight">
          <span className="text-ai-gradient">{t('hub.title')}</span>
        </h1>
        <p className="text-sm text-slate-500">{t('hub.subtitle')}</p>
      </header>

      <ChatSearchBar locale={locale} />

      {conversations.length === 0 ? (
        <div
          className="glass flex flex-col items-center justify-center gap-3 p-10 text-center"
          data-testid="chat-empty-state"
        >
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              className="h-7 w-7"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12a9 9 0 1 1-17.8 1.66L3 21l7.34-.2A9 9 0 0 1 21 12Z" />
            </svg>
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-900">{t('hub.emptyTitle')}</p>
            <p className="text-sm text-slate-500">{t('hub.emptyBody')}</p>
          </div>
          <Link href={`/${locale}/requests`} className="btn-primary">
            {t('hub.browseCta')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {conversations.map((c) => (
            <ConversationRow key={c.id} locale={locale} conv={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
