'use server';

import { revalidatePath } from 'next/cache';
import { getToken } from '@/lib/session';
import { apiFetch } from '@/lib/api';

export async function startKycAction(formData: FormData): Promise<boolean> {
  const token = await getToken();
  const documentType = String(formData.get('documentType') ?? '');
  const documentCountry = String(formData.get('documentCountry') ?? '').toUpperCase();
  if (!['PASSPORT', 'NATIONAL_ID', 'DRIVER_LICENSE'].includes(documentType)) return false;
  if (!/^[A-Z]{2}$/.test(documentCountry)) return false;
  try {
    await apiFetch('/kyc/sessions', {
      method: 'POST',
      body: JSON.stringify({ documentType, documentCountry }),
      token,
    });
    revalidatePath('/[locale]/settings/kyc', 'page');
    return true;
  } catch {
    return false;
  }
}
