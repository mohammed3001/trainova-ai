'use client';

import { useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { fetchEnrollmentsAction, cancelEnrollmentAction } from '../../actions';

interface Enrollment {
  id: string;
  currentStepIdx: number;
  nextRunAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

type State = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ALL';

interface Props {
  sequenceId: string;
}

export function DripEnrollmentsTable({ sequenceId }: Props) {
  const t = useTranslations();
  const [state, setState] = useState<State>('ACTIVE');
  const [items, setItems] = useState<Enrollment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEnrollmentsAction({ sequenceId, state, page: 1, pageSize: 25 })
      .then((data) => {
        if (cancelled) return;
        setItems(data.items as Enrollment[]);
        setTotal(data.total);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sequenceId, state]);

  function refresh() {
    setLoading(true);
    fetchEnrollmentsAction({ sequenceId, state, page: 1, pageSize: 25 })
      .then((data) => {
        setItems(data.items as Enrollment[]);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }

  return (
    <div className="card space-y-3 bg-white/70">
      <div className="flex flex-wrap items-center gap-2">
        {(['ACTIVE', 'COMPLETED', 'CANCELLED', 'ALL'] as State[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setState(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              state === s
                ? 'bg-teal-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t(`admin.emailMarketing.drip.enrollState.${s}`)}
          </button>
        ))}
        <span className="ms-auto text-xs text-slate-500">
          {t('admin.emailMarketing.drip.totalCount', { count: total })}
        </span>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500">{t('admin.emailMarketing.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('admin.emailMarketing.drip.enrollmentsEmpty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50/60 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('admin.emailMarketing.drip.enroll.user')}</th>
                <th className="px-3 py-2 text-start">
                  {t('admin.emailMarketing.drip.enroll.step')}
                </th>
                <th className="px-3 py-2 text-start">
                  {t('admin.emailMarketing.drip.enroll.nextRun')}
                </th>
                <th className="px-3 py-2 text-start">
                  {t('admin.emailMarketing.drip.enroll.state')}
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((e) => {
                const isActive = !e.completedAt && !e.cancelledAt;
                const stateLabel = e.completedAt
                  ? 'COMPLETED'
                  : e.cancelledAt
                    ? 'CANCELLED'
                    : 'ACTIVE';
                return (
                  <tr key={e.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{e.user.name}</div>
                      <div className="text-xs text-slate-500">{e.user.email}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{e.currentStepIdx + 1}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {e.nextRunAt ? new Date(e.nextRunAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                        {t(`admin.emailMarketing.drip.enrollState.${stateLabel}`)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end">
                      {isActive && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (
                              !window.confirm(
                                t('admin.emailMarketing.drip.confirm.cancelEnrollment'),
                              )
                            )
                              return;
                            start(async () => {
                              const result = await cancelEnrollmentAction(e.id);
                              if (!result.ok && result.error) setError(result.error);
                              refresh();
                            });
                          }}
                          className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50"
                        >
                          {t('admin.emailMarketing.drip.actions.cancelEnrollment')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
