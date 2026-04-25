import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import type { DisputeStatus } from '@trainova/shared';

const cls: Record<DisputeStatus, string> = {
  OPEN: 'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200',
  UNDER_REVIEW:
    'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-200',
  RESOLVED_FOR_TRAINER:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  RESOLVED_FOR_COMPANY:
    'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-200',
  REJECTED:
    'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200',
  WITHDRAWN:
    'border-slate-300/60 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200',
};

export function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const t = useTranslations('disputes.status');
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls[status]}`}
    >
      {t(status)}
    </span>
  );
}

export async function DisputeStatusBadgeServer({
  status,
  locale,
}: {
  status: DisputeStatus;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: 'disputes.status' });
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls[status]}`}
    >
      {t(status)}
    </span>
  );
}
