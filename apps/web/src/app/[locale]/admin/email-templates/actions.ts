'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import type {
  CreateEmailTemplateInput,
  EmailTemplateKey,
  EmailTemplateLocale,
  UpdateEmailTemplateInput,
} from '@trainova/shared';

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function readString(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v : '';
}

export async function createEmailTemplateAction(fd: FormData): Promise<ActionResult> {
  const input: CreateEmailTemplateInput = {
    key: readString(fd, 'key') as EmailTemplateKey,
    locale: readString(fd, 'locale') as EmailTemplateLocale,
    subject: readString(fd, 'subject'),
    bodyHtml: readString(fd, 'bodyHtml'),
    bodyText: readString(fd, 'bodyText'),
    enabled: fd.get('enabled') === 'on' || fd.get('enabled') === 'true',
    description: readString(fd, 'description') || null,
  };

  try {
    await authedFetch('/admin/email-templates', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  revalidatePath('/[locale]/admin/email-templates', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-templates`);
}

export async function updateEmailTemplateAction(id: string, fd: FormData): Promise<ActionResult> {
  const input: UpdateEmailTemplateInput = {
    subject: readString(fd, 'subject'),
    bodyHtml: readString(fd, 'bodyHtml'),
    bodyText: readString(fd, 'bodyText'),
    enabled: fd.get('enabled') === 'on' || fd.get('enabled') === 'true',
    description: readString(fd, 'description') || null,
  };

  try {
    await authedFetch(`/admin/email-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }

  revalidatePath(`/[locale]/admin/email-templates/${id}`, 'page');
  revalidatePath('/[locale]/admin/email-templates', 'page');
  return { ok: true };
}

export async function deleteEmailTemplateAction(id: string): Promise<ActionResult> {
  try {
    await authedFetch(`/admin/email-templates/${id}`, { method: 'DELETE' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  revalidatePath('/[locale]/admin/email-templates', 'page');
  const locale = await getLocale();
  redirect(`/${locale}/admin/email-templates`);
}

export async function previewEmailTemplateAction(
  subject: string,
  bodyHtml: string,
  bodyText: string,
  variables: Record<string, string>,
): Promise<{
  subject: string;
  bodyHtml: string;
  bodyText: string;
  unresolvedVariables: string[];
}> {
  return authedFetch('/admin/email-templates/preview', {
    method: 'POST',
    body: JSON.stringify({ subject, bodyHtml, bodyText, variables }),
    headers: { 'Content-Type': 'application/json' },
  });
}
