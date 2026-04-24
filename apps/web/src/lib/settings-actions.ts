'use server';

import { revalidatePath } from 'next/cache';
import { apiFetch } from './api';
import { getToken } from './session';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  return apiFetch<T>(path, { ...init, token });
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return v == null ? '' : String(v);
}

function opt(fd: FormData, key: string): string | undefined {
  const v = str(fd, key).trim();
  return v.length ? v : undefined;
}

/**
 * Parses the rendered form value into JSON. Settings registry keys are typed,
 * so the form gives us either a primitive string field, a numeric field, a
 * checkbox, or a raw JSON textarea (for arrays/objects).
 *
 * Field naming convention: `value` is the canonical input name; `valueType`
 * disambiguates between `string`, `number`, `boolean`, and `json`.
 */
function parseValue(fd: FormData): unknown {
  const valueType = str(fd, 'valueType') || 'string';
  const raw = str(fd, 'value');
  if (valueType === 'boolean') {
    return raw === 'true' || raw === 'on' || raw === '1';
  }
  if (valueType === 'number') {
    if (!raw.trim()) return 0;
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error('Invalid numeric value');
    return n;
  }
  if (valueType === 'json') {
    if (!raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`Invalid JSON: ${(e as Error).message}`);
    }
  }
  return raw;
}

export async function saveSettingAction(formData: FormData): Promise<void> {
  const key = str(formData, 'key').trim();
  if (!key) throw new Error('Setting key is required');

  const isPublic = str(formData, 'isPublic') === 'true' || str(formData, 'isPublic') === 'on';
  const group = opt(formData, 'group');
  const description = opt(formData, 'description');
  const value = parseValue(formData);

  await call(`/admin/settings`, {
    method: 'POST',
    body: JSON.stringify({
      key,
      value,
      ...(group ? { group } : {}),
      isPublic,
      ...(description ? { description } : {}),
    }),
  });

  revalidatePath(`/[locale]/admin/settings`, 'page');
  revalidatePath(`/[locale]/admin/settings/${encodeURIComponent(key)}`, 'page');
}

export async function deleteSettingAction(formData: FormData): Promise<void> {
  const key = str(formData, 'key').trim();
  if (!key) throw new Error('Setting key is required');
  await call(`/admin/settings/${encodeURIComponent(key)}`, { method: 'DELETE' });
  revalidatePath(`/[locale]/admin/settings`, 'page');
}
