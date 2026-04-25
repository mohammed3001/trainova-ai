'use server';

import {
  advertiseEnquirySchema,
  contactSubmissionSchema,
} from '@trainova/shared';

const apiBase = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
).replace(/\/+$/, '');

export type ContactState = { done?: true; error?: string } | null;

function asTrimmedString(v: FormDataEntryValue | null): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function asInteger(v: FormDataEntryValue | null): number | undefined {
  const s = asTrimmedString(v);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isFinite(n) && Number.isInteger(n) ? n : undefined;
}

export async function submitContactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot: silently report success when the hidden field has any value
  // so bots cannot tell the field is monitored. Must run BEFORE the
  // schema parse so a bot-generated payload that fails other validators
  // still doesn't reveal the trap.
  const websiteRaw = formData.get('website');
  if (typeof websiteRaw === 'string' && websiteRaw.trim().length > 0) {
    return { done: true };
  }
  const parsed = contactSubmissionSchema.safeParse({
    name: asTrimmedString(formData.get('name')),
    email: asTrimmedString(formData.get('email')),
    topic: asTrimmedString(formData.get('topic')) ?? 'GENERAL',
    company: asTrimmedString(formData.get('company')),
    message: asTrimmedString(formData.get('message')),
    locale: asTrimmedString(formData.get('locale')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  try {
    const res = await fetch(`${apiBase}/api/public/contact`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok && res.status !== 202) {
      return { error: `Request failed (${res.status})` };
    }
    return { done: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function submitAdvertiseAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot: see submitContactAction.
  const websiteRaw = formData.get('website');
  if (typeof websiteRaw === 'string' && websiteRaw.trim().length > 0) {
    return { done: true };
  }
  const budgetUsd = asInteger(formData.get('budgetUsd'));
  const parsed = advertiseEnquirySchema.safeParse({
    name: asTrimmedString(formData.get('name')),
    email: asTrimmedString(formData.get('email')),
    company: asTrimmedString(formData.get('company')),
    packageId: asTrimmedString(formData.get('packageId')) ?? 'CUSTOM',
    budgetUsd,
    message: asTrimmedString(formData.get('message')),
    locale: asTrimmedString(formData.get('locale')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'invalid' };
  }
  try {
    const res = await fetch(`${apiBase}/api/public/contact/advertise`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok && res.status !== 202) {
      return { error: `Request failed (${res.status})` };
    }
    return { done: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Network error' };
  }
}
