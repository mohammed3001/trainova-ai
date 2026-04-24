import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ActionButton } from '@/components/admin/action-button';
import { JsonAccordion } from '@/components/admin/json-accordion';
import {
  redactMessageAction,
  setConversationLockedAction,
} from '@/lib/admin-actions';

interface Participant {
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
}

interface Message {
  id: string;
  body: string;
  type: string;
  redactedAt: string | null;
  redactedById: string | null;
  redactReason: string | null;
  createdAt: string;
  sender: { id: string; name: string; email: string; role: string };
}

interface ConversationDetail {
  id: string;
  lockedAt: string | null;
  lockedById: string | null;
  lockReason: string | null;
  createdAt: string;
  updatedAt: string;
  request: {
    id: string;
    slug: string;
    title: string;
    company: { id: string; name: string; slug: string };
  } | null;
  participants: Participant[];
  messages: Message[];
}

export default async function AdminConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let row: ConversationDetail;
  try {
    row = await authedFetch<ConversationDetail>(`/admin/conversations/${id}`);
  } catch {
    notFound();
  }

  const locked = !!row.lockedAt;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/conversations`} className="hover:text-brand-700">
          ← {t('admin.conversations.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {locked ? (
              <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                {t('admin.conversations.lockedBadge')}
              </span>
            ) : null}
            {row.request ? (
              <Link
                href={`/${locale}/admin/requests/${row.request.id}`}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-200"
              >
                {row.request.title}
              </Link>
            ) : null}
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {row.participants.map((p) => p.user.name).join(' · ')}
          </h1>
          <div className="mt-1 text-xs text-slate-500">
            {row.participants.map((p) => p.user.email).join(' · ')}
          </div>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.users.col.created')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {new Date(row.createdAt).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="inline">{t('admin.conversations.col.updatedAt')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {new Date(row.updatedAt).toLocaleString()}
            </dd>
          </div>
          {row.lockReason ? (
            <div>
              <dt className="inline">Lock reason:</dt>{' '}
              <dd className="inline text-slate-700">{row.lockReason}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.conversations.section.messages')}
          </h2>
          {row.messages.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">{t('admin.conversations.noMessages')}</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {row.messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-xl border border-slate-200 bg-white/80 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800">{m.sender.name}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                        {m.sender.role}
                      </span>
                      {m.redactedAt ? (
                        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                          {t('admin.conversations.redactedBadge')}
                        </span>
                      ) : null}
                    </div>
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {m.body}
                  </div>
                  {m.redactedAt ? (
                    <div className="mt-2 text-xs text-rose-700">
                      {t('admin.conversations.action.reasonLabel')}: {m.redactReason ?? '—'}
                    </div>
                  ) : (
                    <form
                      action={redactMessageAction}
                      className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"
                    >
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="conversationId" value={row.id} />
                      <label className="flex-1 text-xs font-semibold text-slate-500">
                        {t('admin.conversations.action.reasonLabel')}
                        <input
                          name="reason"
                          required
                          minLength={1}
                          maxLength={1000}
                          placeholder={t(
                            'admin.conversations.action.reasonPlaceholder',
                          )}
                          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                        />
                      </label>
                      <ActionButton
                        variant="danger"
                        confirm={t('admin.conversations.confirm.redact')}
                      >
                        {t('admin.conversations.action.redact')}
                      </ActionButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.conversations.section.participants')}
            </h2>
            <ul className="mt-3 space-y-2">
              {row.participants.map((p) => (
                <li key={p.userId}>
                  <Link
                    href={`/${locale}/admin/users/${p.userId}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm hover:border-brand-300 hover:bg-brand-50/50"
                  >
                    <span className="truncate">
                      <span className="font-medium text-slate-900">{p.user.name}</span>
                      <span className="ms-2 font-mono text-[11px] text-slate-500">
                        {p.user.role}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">{p.user.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.conversations.section.actions')}
            </h2>
            <form action={setConversationLockedAction} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="locked" value={locked ? 'false' : 'true'} />
              {!locked ? (
                <textarea
                  name="reason"
                  rows={2}
                  maxLength={1000}
                  placeholder={t('admin.conversations.action.lockReasonPlaceholder')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
                />
              ) : null}
              <ActionButton
                variant={locked ? 'ghost' : 'danger'}
                confirm={
                  locked
                    ? t('admin.conversations.confirm.unlock')
                    : t('admin.conversations.confirm.lock')
                }
              >
                {locked
                  ? t('admin.conversations.action.unlock')
                  : t('admin.conversations.action.lock')}
              </ActionButton>
            </form>
          </section>
        </aside>
      </div>

      <JsonAccordion title="Raw JSON" data={row} />
    </div>
  );
}
