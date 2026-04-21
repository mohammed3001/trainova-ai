const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}/api${path}`, {
    ...rest,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    const err: ApiError = {
      status: res.status,
      message:
        (body && typeof body === 'object' && 'message' in body ? String(body.message) : null) ??
        `Request failed (${res.status})`,
      details: body,
    };
    throw err;
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const apiUrl = API_URL;
