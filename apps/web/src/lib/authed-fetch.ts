import { getToken } from './session';
import { apiFetch } from './api';

export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  return apiFetch<T>(path, { ...init, token });
}
