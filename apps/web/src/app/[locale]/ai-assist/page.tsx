import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getToken } from '@/lib/session';
import { AiAssistClient } from './AiAssistClient';

export const dynamic = 'force-dynamic';

export default async function AiAssistPage() {
  const locale = await getLocale();
  const token = await getToken();
  if (!token) redirect(`/${locale}/login`);
  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      <AiAssistClient locale={locale as 'en' | 'ar' | 'fr' | 'es'} />
    </div>
  );
}
