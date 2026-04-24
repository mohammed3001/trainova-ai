import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const links: Array<{ href: string; label: string }> = [
    { href: `/${locale}/admin`, label: t('admin.nav.overview') },
    { href: `/${locale}/admin/users`, label: t('admin.nav.users') },
    { href: `/${locale}/admin/companies`, label: t('admin.nav.companies') },
    { href: `/${locale}/admin/trainers`, label: t('admin.nav.trainers') },
    { href: `/${locale}/admin/verification`, label: t('admin.nav.verification') },
    { href: `/${locale}/admin/requests`, label: t('admin.nav.requests') },
  ];

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-10 h-64 bg-gradient-to-br from-brand-500/15 via-fuchsia-400/10 to-transparent blur-3xl"
      />
      <div className="relative grid gap-6 lg:grid-cols-[220px,1fr]">
        <aside className="sticky top-4 self-start rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-md">
          <div className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.nav.title')}
          </div>
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
