'use client';

import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales } from '@/i18n/config';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  const other = locales.find((l) => l !== locale) ?? 'en';
  function switchTo() {
    const segments = pathname.split('/');
    if (segments.length > 1) segments[1] = other;
    router.push(segments.join('/') || `/${other}`);
  }

  return (
    <button
      type="button"
      onClick={switchTo}
      className="btn-ghost text-xs"
      aria-label="Switch language"
    >
      {other === 'ar' ? 'العربية' : 'EN'}
    </button>
  );
}
