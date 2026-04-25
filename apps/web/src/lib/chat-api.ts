import { authedFetch } from './authed-fetch';

export interface ConversationSummary {
  id: string;
  requestId: string | null;
  updatedAt: string;
  createdAt: string;
  unread: number;
  lastMessage: {
    id: string;
    body: string;
    type: string;
    createdAt: string;
    senderId: string;
    senderName: string | null;
  } | null;
  otherParticipant: {
    userId: string;
    name: string | null;
    role: string;
  } | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  type: string;
  createdAt: string;
  sender?: { id: string; name: string | null; role: string };
}

export interface ConversationDetail {
  id: string;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
  request: { id: string; title: string; slug: string } | null;
  participants: Array<{
    userId: string;
    lastReadAt: string | null;
    user: { id: string; name: string | null; role: string };
  }>;
}

export const listConversations = () =>
  authedFetch<ConversationSummary[]>('/chat/conversations');

export const getUnreadCount = () =>
  authedFetch<{ total: number }>('/chat/unread-count');

export const getConversation = (id: string) =>
  authedFetch<ConversationDetail>(`/chat/conversations/${id}`);

export const listMessages = (id: string) =>
  authedFetch<ChatMessage[]>(`/chat/conversations/${id}/messages`);

export const startConversationServer = (input: {
  otherUserId: string;
  requestId?: string;
}) =>
  authedFetch<{ id: string }>(`/chat/conversations`, {
    method: 'POST',
    body: JSON.stringify(input),
  });

// T7.H — search + saved templates.
export interface MessageSearchHit {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender?: { id: string; name: string | null };
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
  updatedAt: string;
}

export const searchMessages = (q: string, conversationId?: string) => {
  const params = new URLSearchParams({ q });
  if (conversationId) params.set('conversationId', conversationId);
  return authedFetch<{ items: MessageSearchHit[] }>(
    `/chat/messages/search?${params.toString()}`,
  );
};

export const listTemplates = () =>
  authedFetch<MessageTemplate[]>('/chat/templates');

// T8.A — inline AI chat summary + action-item extraction. Both endpoints
// live on the AI Assist module (gated by the `ai_assistant` feature flag);
// the browser hits them through `/api/proxy/ai-assist/...` like any other
// authenticated API call. We deliberately type the response shapes here
// instead of importing from `@trainova/shared` because the web bundle does
// not ship the zod schemas.
export interface ChatSummaryResult {
  summary: string;
  keyPoints: string[];
  language: string;
  upToMessageId: string;
}

export interface ChatTaskItem {
  text: string;
  ownerHint: string | null;
  dueHint: string | null;
}

export interface ChatTasksResult {
  tasks: ChatTaskItem[];
  upToMessageId: string;
}

/**
 * The summary + task helpers are called from the chat-room **client**
 * component, where `authedFetch` cannot run (it reads httpOnly cookies
 * via `next/headers`, which is server-only). We forward through the
 * Next.js catch-all proxy at `/api/proxy/[...path]` instead — that route
 * attaches the auth cookie + injects the trusted client IP exactly like
 * the existing chat send/markRead calls do.
 */
async function postProxy<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err: { status: number; message: string; details?: unknown } = {
      status: res.status,
      message: text || `Request failed (${res.status})`,
    };
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (parsed && typeof parsed.message === 'string') err.message = parsed.message;
      err.details = parsed;
    } catch {
      // non-JSON body — leave the raw text in `message`.
    }
    throw err;
  }
  return (await res.json()) as T;
}

export const summarizeChat = (conversationId: string, maxMessages = 80) =>
  postProxy<ChatSummaryResult>('/ai-assist/chat-summary', { conversationId, maxMessages });

export const extractChatTasks = (conversationId: string, maxMessages = 80) =>
  postProxy<ChatTasksResult>('/ai-assist/chat-tasks', { conversationId, maxMessages });
