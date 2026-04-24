interface Props {
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' | string;
  labels: { active: string; suspended: string; pending: string };
}

const COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 ring-rose-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
};

export function StatusPill({ status, labels }: Props) {
  const label =
    status === 'ACTIVE' ? labels.active : status === 'SUSPENDED' ? labels.suspended : labels.pending;
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ' +
        (COLORS[status] ?? 'bg-slate-50 text-slate-700 ring-slate-200')
      }
    >
      {label}
    </span>
  );
}
