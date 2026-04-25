'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface AdminNavLink {
  href: string;
  label: string;
}

/**
 * Admin sidebar nav. Rendered as a client component so each link can
 * announce its active state via `aria-current="page"` — assistive tech
 * then reads "current page" instead of the raw URL change, and keyboard
 * users get a persistent visual indicator (the filled background) even
 * when they tab away from the active link.
 */
export function AdminNav({ links, label }: { links: AdminNavLink[]; label?: string }) {
  const pathname = usePathname();
  const ta = useTranslations('a11y');
  const navLabel = label ?? ta('adminNav');

  // The base admin overview lives at `/{locale}/admin` and every other
  // sidebar item is a strict descendant. Using a `startsWith` match for
  // it would light up Overview alongside the actual sub-page on every
  // nested route. The longest matching prefix wins instead.
  const activeHref = (() => {
    let best: string | null = null;
    for (const l of links) {
      if (pathname === l.href || pathname.startsWith(`${l.href}/`)) {
        if (!best || l.href.length > best.length) best = l.href;
      }
    }
    return best;
  })();

  return (
    <nav aria-label={navLabel} className="flex flex-col gap-1">
      {links.map((l) => {
        const active = l.href === activeHref;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white'
                : 'rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700'
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
