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
