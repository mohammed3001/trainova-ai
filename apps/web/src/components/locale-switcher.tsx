'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('preferences');

  function switchTo(next: string) {
    if (next === locale) return;
    const segments = pathname.split('/');
    if (segments.length > 1) segments[1] = next;
    router.push(segments.join('/') || `/${next}`);
  }

  return (
    <label className="relative">
      <span className="sr-only">{t('localeLabel')}</span>
      <select
        value={locale}
        onChange={(e) => switchTo(e.currentTarget.value)}
        className="appearance-none rounded-md border border-white/10 bg-white/5 px-2.5 py-1 pr-7 text-xs font-medium text-slate-100 shadow-sm transition hover:bg-white/10 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-300/40"
        aria-label={t('localeLabel')}
        data-testid="locale-switcher"
      >
        {locales.map((l) => (
          <option key={l} value={l} className="bg-slate-900 text-slate-100">
            {t(`localeOptions.${l as Locale}`)}
          </option>
        ))}
      </select>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-300"
      >
        ▾
      </span>
    </label>
  );
}
