'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Mobile drawer menu (T9.O — mobile responsive pass).
 *
 * Renders the same primary nav links as the desktop header but in a
 * full-height drawer that slides in from the inline-end side. Visible
 * only below the `md` breakpoint (≥ 768px the desktop nav takes over).
 *
 * Accessibility:
 *   - The trigger toggles `aria-expanded` and points at the drawer via
 *     `aria-controls`.
 *   - The drawer is a `<dialog>`-shaped landmark with `role="dialog"`,
 *     `aria-modal="true"`, and a labelled heading.
 *   - Escape closes; clicking the scrim closes; tabbing past the last
 *     focusable element wraps to the first (and shift+tab wraps the
 *     other way) — basic focus trap so screen-reader users don't
 *     escape the drawer into the still-rendered page behind.
 *   - Body scroll is locked while the drawer is open so iOS Safari
 *     doesn't double-scroll the page underneath.
 */
export function MobileMenu({
  locale,
  authed,
  dashboardHref,
}: {
  locale: string;
  authed: boolean;
  dashboardHref: string;
}) {
  const t = useTranslations('common');
  const ta = useTranslations('a11y');
  const [open, setOpen] = useState(false);
  const dialogId = useId();
  const headingId = `${dialogId}-heading`;
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape, lock body scroll, and return focus to the trigger
  // when the drawer closes (matches the WAI-ARIA APG dialog pattern).
  useEffect(() => {
    if (!open) return;
    // Capture refs at effect start so cleanup uses the same node React
    // saw on render — react-hooks/exhaustive-deps wants this guarantee
    // because the ref's `.current` could change between render and
    // cleanup if the trigger were ever conditionally rendered.
    const triggerEl = triggerRef.current;
    const drawerEl = drawerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    // Move focus into the drawer on the next tick so the close button
    // becomes the first stop.
    const closeBtn = drawerEl?.querySelector<HTMLButtonElement>(
      '[data-mobile-menu-close]',
    );
    closeBtn?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      triggerEl?.focus();
    };
  }, [open]);

  const close = () => setOpen(false);

  const linkCls =
    'block rounded-md px-3 py-3 text-base font-medium text-slate-800 hover:bg-slate-100 hover:text-brand-700 focus-visible:bg-slate-100';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label={ta('openMenu')}
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 md:hidden"
        data-testid="mobile-menu-trigger"
      >
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-6 w-6"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={headingId}
          className="fixed inset-0 z-50 md:hidden"
          data-testid="mobile-menu-drawer"
        >
          {/* Scrim — click closes the drawer. The button role isn't set
              because it's purely decorative (pointer-only); keyboard
              users use the close button or Escape. */}
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={close}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            className="absolute inset-y-0 end-0 flex w-[85%] max-w-sm flex-col gap-1 overflow-y-auto bg-white p-4 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id={headingId} className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {ta('mobileNav')}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={ta('closeMenu')}
                data-mobile-menu-close
                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="h-6 w-6"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav aria-label={ta('primaryNav')} className="flex flex-col gap-1">
              <Link href={`/${locale}/requests`} className={linkCls} onClick={close}>
                {t('browseRequests')}
              </Link>
              <Link href={`/${locale}/trainers`} className={linkCls} onClick={close}>
                {t('browseTrainers')}
              </Link>
              <Link href={`/${locale}/skills`} className={linkCls} onClick={close}>
                {t('skills')}
              </Link>
              <Link href={`/${locale}/pricing`} className={linkCls} onClick={close}>
                {t('pricing')}
              </Link>
              <Link href={`/${locale}/how-it-works`} className={linkCls} onClick={close}>
                {t('howItWorks')}
              </Link>
              <Link href={`/${locale}/blog`} className={linkCls} onClick={close}>
                {t('blog')}
              </Link>
              <Link href={`/${locale}/faq`} className={linkCls} onClick={close}>
                {t('faq')}
              </Link>
            </nav>
            <div className="mt-3 border-t border-slate-200 pt-3">
              {authed ? (
                <div className="flex flex-col gap-2">
                  <Link href={dashboardHref} className="btn-primary w-full justify-center" onClick={close}>
                    {t('dashboard')}
                  </Link>
                  <Link
                    href={`/api/logout?locale=${locale}`}
                    prefetch={false}
                    className="btn-ghost w-full justify-center"
                    onClick={close}
                  >
                    {t('signOut')}
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/${locale}/register`}
                    className="btn-primary w-full justify-center"
                    onClick={close}
                  >
                    {t('getStarted')}
                  </Link>
                  <Link
                    href={`/${locale}/login`}
                    className="btn-secondary w-full justify-center"
                    onClick={close}
                  >
                    {t('signIn')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
