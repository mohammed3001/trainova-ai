import { logoutAction } from '@/lib/auth-actions';
import { getLocale } from 'next-intl/server';

export default async function LogoutPage() {
  const locale = await getLocale();
  await logoutAction(locale);
  return null;
}
