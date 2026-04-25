import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { StatusPill } from '@/components/admin/status-pill';
import { ActionButton } from '@/components/admin/action-button';
import {
  setUserRoleAction,
  setUserStatusAction,
  markEmailVerifiedAction,
  resendVerifyEmailAction,
  triggerPasswordResetAction,
} from '@/lib/admin-actions';

interface UserDetail {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  locale: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  company: { id: string; name: string; slug: string; verified: boolean } | null;
  trainerProfile: { id: string; slug: string; headline: string | null; verified: boolean } | null;
  _count: { applications: number };
}

const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'FINANCE',
  'SUPPORT',
  'CONTENT_MANAGER',
  'ADS_MANAGER',
  'COMPANY_OWNER',
  'COMPANY_MEMBER',
  'TRAINER',
] as const;
const STATUSES = ['ACTIVE', 'SUSPENDED', 'PENDING'] as const;

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let user: UserDetail;
  try {
    user = await authedFetch<UserDetail>(`/admin/users/${id}`);
  } catch {
    notFound();
  }

  const statusLabels = {
    active: t('admin.userStatus.ACTIVE'),
    suspended: t('admin.userStatus.SUSPENDED'),
    pending: t('admin.userStatus.PENDING'),
  };

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/users`} className="hover:text-brand-700">
          ← {t('admin.users.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
          <p className="mt-1 font-mono text-sm text-slate-600">{user.email}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
              {t(`admin.userRole.${user.role}` as 'admin.userRole.SUPER_ADMIN')}
            </span>
            <StatusPill status={user.status} labels={statusLabels} />
            <span className="text-slate-500">
              {user.emailVerifiedAt ? t('admin.users.emailVerified') : t('admin.users.emailUnverified')}
            </span>
          </div>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.users.col.created')}:</dt>{' '}
            <dd className="inline text-slate-700">{new Date(user.createdAt).toLocaleString()}</dd>
          </div>
          {user.lastLoginAt && (
            <div>
              <dt className="inline">{t('admin.users.lastLogin')}:</dt>{' '}
              <dd className="inline text-slate-700">{new Date(user.lastLoginAt).toLocaleString()}</dd>
            </div>
          )}
          <div>
            <dt className="inline">{t('admin.users.applications')}:</dt>{' '}
            <dd className="inline text-slate-700">{user._count.applications}</dd>
          </div>
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.users.section.role')}
          </h2>
          <form action={setUserRoleAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={user.id} />
            <select
              name="role"
              defaultValue={user.role}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`admin.userRole.${r}` as 'admin.userRole.SUPER_ADMIN')}
                </option>
              ))}
            </select>
            <ActionButton
              variant="primary"
              confirm={t('admin.users.confirm.role')}
            >
              {t('admin.users.action.saveRole')}
            </ActionButton>
          </form>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.users.section.status')}
          </h2>
          <form action={setUserStatusAction} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={user.id} />
            <select
              name="status"
              defaultValue={user.status}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.userStatus.${s}` as 'admin.userStatus.ACTIVE')}
                </option>
              ))}
            </select>
            <ActionButton
              variant="danger"
              confirm={t('admin.users.confirm.status')}
            >
              {t('admin.users.action.saveStatus')}
            </ActionButton>
          </form>
          <p className="mt-2 text-xs text-slate-500">{t('admin.users.suspensionHint')}</p>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.users.section.email')}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <form action={markEmailVerifiedAction}>
              <input type="hidden" name="id" value={user.id} />
              <ActionButton
                variant="success"
                disabled={!!user.emailVerifiedAt}
                confirm={t('admin.users.confirm.markVerified')}
              >
                {t('admin.users.action.markVerified')}
              </ActionButton>
            </form>
            <form action={resendVerifyEmailAction}>
              <input type="hidden" name="id" value={user.id} />
              <ActionButton variant="ghost" disabled={!!user.emailVerifiedAt}>
                {t('admin.users.action.resendVerify')}
              </ActionButton>
            </form>
            <form action={triggerPasswordResetAction}>
              <input type="hidden" name="id" value={user.id} />
              <ActionButton variant="ghost" confirm={t('admin.users.confirm.resetPassword')}>
                {t('admin.users.action.resetPassword')}
              </ActionButton>
            </form>
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.users.section.relations')}
          </h2>
          <div className="mt-3 space-y-2 text-sm">
            {user.company && (
              <Link
                href={`/${locale}/admin/companies/${user.company.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span>
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.users.linkedCompany')}
                  </span>
                  <span className="block text-slate-900">{user.company.name}</span>
                </span>
                <span className="text-slate-400">→</span>
              </Link>
            )}
            {user.trainerProfile && (
              <Link
                href={`/${locale}/admin/trainers/${user.trainerProfile.id}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/50"
              >
                <span>
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.users.linkedTrainer')}
                  </span>
                  <span className="block text-slate-900">
                    {user.trainerProfile.headline ?? user.trainerProfile.slug}
                  </span>
                </span>
                <span className="text-slate-400">→</span>
              </Link>
            )}
            {!user.company && !user.trainerProfile && (
              <p className="text-xs text-slate-500">{t('admin.users.noRelations')}</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
