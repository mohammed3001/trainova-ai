// T8.A — client-safe API helpers for the inline AI co-pilot panel.
// Lives in its own module (separate from `chat-api.ts`) because that file
// imports `authedFetch`, which reads httpOnly cookies via `next/headers`
// and therefore cannot be bundled into a client component. Even pulling
// in a value export (e.g. `summarizeChat`) from `chat-api.ts` would drag
// the whole module — including the `next/headers` reference — into the
// browser bundle and break the production build with:
//
//     "You're importing a component that needs 'next/headers'."
//
// Anything that needs to run from a client component should live here
// (or get re-exported from here) and use `postProxy` to forward the call
// through the existing `/api/proxy/[...path]` catch-all route, which
// attaches the auth cookie + rewrites the trusted client IP.

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

async function postProxy<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (parsed && typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // non-JSON body — leave the raw text in `message`.
    }
    const err: Error & { status?: number } = new Error(message);
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export const summarizeChat = (conversationId: string, maxMessages = 80) =>
  postProxy<ChatSummaryResult>('/ai-assist/chat-summary', {
    conversationId,
    maxMessages,
  });

export const extractChatTasks = (conversationId: string, maxMessages = 80) =>
  postProxy<ChatTasksResult>('/ai-assist/chat-tasks', {
    conversationId,
    maxMessages,
  });
