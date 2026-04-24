import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { PublicContract } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';

export default async function CompanyContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/contracts`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const [contracts, t] = await Promise.all([
    authedFetch<PublicContract[]>('/contracts/mine/company').catch(
      () => [] as PublicContract[],
    ),
    getTranslations({ locale, namespace: 'contracts' }),
  ]);

  const fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('listTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('listSubtitle')}</p>
      </header>

      {contracts.length === 0 ? (
        <div className="rounded-3xl border border-white/40 bg-white/70 p-8 text-center backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t('listEmpty')}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contracts.map((c) => {
            const fundedCount = c.milestones.filter(
              (m) => m.status === 'FUNDED' || m.status === 'RELEASED',
            ).length;
            return (
              <li key={c.id}>
                <Link
                  href={`/${locale}/company/contracts/${c.id}`}
                  className="group block overflow-hidden rounded-3xl border border-white/40 bg-white/70 p-5 shadow-sm backdrop-blur-md transition hover:border-brand-200 hover:shadow-md dark:border-white/10 dark:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50 group-hover:text-brand-700 dark:group-hover:text-brand-300">
                      {c.title}
                    </h2>
                    <StatusChip status={c.status} />
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {c.trainer?.name ?? t('trainerUnknown')}
                  </p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t('total')}
                      </dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {fmt.format(c.totalAmountCents / 100)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t('milestones')}
                      </dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {fundedCount}/{c.milestones.length}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t('fee')}
                      </dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-100">
                        {(c.platformFeeBps / 100).toFixed(1)}%
                      </dd>
                    </div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
    ACTIVE:
      'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200',
    COMPLETED:
      'border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200',
    CANCELLED: 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200',
    DISPUTED: 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200',
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${map[status] ?? map.DRAFT}`}
    >
      {status}
    </span>
  );
}
