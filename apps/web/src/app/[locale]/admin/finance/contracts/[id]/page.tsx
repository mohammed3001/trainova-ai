import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCents } from '@/lib/format-money';
import type { AdminContractDetail } from '@trainova/shared';
import { RefundMilestoneForm } from './refund-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function AdminContractDetailPage({ params }: PageProps) {
  const t = await getTranslations();
  const locale = await getLocale();
  const { id } = await params;
  const intlLocale = locale === 'ar' ? 'ar-SA' : 'en-US';

  let contract: AdminContractDetail;
  try {
    contract = await authedFetch<AdminContractDetail>(`/admin/finance/contracts/${id}`);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/${locale}/admin/finance/contracts`}
            className="text-xs font-medium text-slate-500 hover:underline"
          >
            ← {t('admin.finance.contracts.title')}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{contract.title}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {contract.company.name} · {contract.trainer.name} · {contract.trainer.email}
          </p>
        </div>
        <div className="text-end">
          <p className="text-3xl font-bold tabular-nums text-slate-900">
            {formatCents(contract.totalAmountCents, contract.currency, intlLocale)}
          </p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
            {t(`admin.finance.contractStatus.${contract.status}` as 'admin.finance.contractStatus.PENDING')}
          </span>
        </div>
      </header>

      {contract.description ? (
        <p className="rounded-2xl border border-white/60 bg-white/70 p-6 text-sm text-slate-700 shadow-sm backdrop-blur-md">
          {contract.description}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('admin.finance.contracts.milestones')}
        </h2>
        {contract.milestones.length === 0 ? (
          <p className="rounded-2xl border border-white/60 bg-white/70 p-6 text-sm text-slate-500 shadow-sm backdrop-blur-md">
            {t('admin.finance.empty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {contract.milestones.map((m) => (
              <li
                key={m.id}
                className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">#{m.order}</span>
                      <h3 className="text-sm font-semibold text-slate-900">{m.title}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-700">
                        {t(`admin.finance.milestoneStatus.${m.status}` as 'admin.finance.milestoneStatus.PENDING')}
                      </span>
                    </div>
                    {m.description ? (
                      <p className="mt-1 text-xs text-slate-600">{m.description}</p>
                    ) : null}
                  </div>
                  <div className="text-end">
                    <p className="text-base font-semibold tabular-nums text-slate-900">
                      {formatCents(m.amountCents, contract.currency, intlLocale)}
                    </p>
                    {m.dueDate ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {t('admin.finance.contracts.due')}: {new Date(m.dueDate).toLocaleDateString(intlLocale)}
                      </p>
                    ) : null}
                  </div>
                </div>

                {(m.paymentIntents.length > 0 || m.payouts.length > 0) ? (
                  <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                    {m.paymentIntents.length > 0 ? (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {t('admin.finance.contracts.paymentIntents')}
                        </h4>
                        <ul className="space-y-1.5 text-xs">
                          {m.paymentIntents.map((pi) => (
                            <li key={pi.id} className="flex items-center justify-between gap-2">
                              <span className="font-mono text-slate-600">
                                {pi.stripePaymentIntentId.slice(0, 14)}…
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                                {pi.status}
                              </span>
                              <span className="font-semibold tabular-nums text-slate-900">
                                {formatCents(pi.amountCents, contract.currency, intlLocale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {m.payouts.length > 0 ? (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          {t('admin.finance.contracts.payouts')}
                        </h4>
                        <ul className="space-y-1.5 text-xs">
                          {m.payouts.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-2">
                              <span className="font-mono text-slate-600">
                                {p.stripeTransferId
                                  ? `${p.stripeTransferId.slice(0, 14)}…`
                                  : '—'}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                                {t(`admin.finance.payoutStatus.${p.status}` as 'admin.finance.payoutStatus.PENDING')}
                              </span>
                              <span className="font-semibold tabular-nums text-slate-900">
                                {formatCents(p.amountCents, contract.currency, intlLocale)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {m.status === 'FUNDED' ? (
                  <div className="border-t border-slate-100 bg-rose-50/60 p-4">
                    <RefundMilestoneForm
                      contractId={contract.id}
                      milestoneId={m.id}
                      amountLabel={formatCents(m.amountCents, contract.currency, intlLocale)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
