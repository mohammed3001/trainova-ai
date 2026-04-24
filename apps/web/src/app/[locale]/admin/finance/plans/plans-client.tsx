'use client';

import { useState, useTransition } from 'react';
import type { AdminPlanRow, PlanAudience } from '@trainova/shared';
import { createPlanAction, deletePlanAction, updatePlanAction } from '../actions';

interface Labels {
  createTitle: string;
  editTitle: string;
  audience: string;
  tier: string;
  monthly: string;
  yearly: string;
  subs: string;
  actions: string;
  stripePriceId: string;
  features: string;
  create: string;
  edit: string;
  remove: string;
  deleteConfirm: string;
  companyHeader: string;
  trainerHeader: string;
  empty: string;
  dismiss: string;
  save: string;
}

interface Props {
  plans: AdminPlanRow[];
  groups: Record<PlanAudience, AdminPlanRow[]>;
  labels: Labels;
  formatMonthly: (cents: number) => string;
}

interface DraftState {
  mode: 'create' | 'edit';
  plan?: AdminPlanRow;
}

export function PlansClient({ plans: _plans, groups, labels, formatMonthly }: Props) {
  void _plans;
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openCreate() {
    setError(null);
    setDraft({ mode: 'create' });
  }
  function openEdit(plan: AdminPlanRow) {
    setError(null);
    setDraft({ mode: 'edit', plan });
  }

  async function handleSubmit(fd: FormData) {
    setError(null);
    if (draft?.mode === 'create') {
      const r = await createPlanAction(fd);
      if (r && !r.ok) setError(r.error ?? 'Failed');
      else setDraft(null);
    } else if (draft?.mode === 'edit' && draft.plan) {
      const r = await updatePlanAction(draft.plan.id, fd);
      if (!r.ok) setError(r.error ?? 'Failed');
      else setDraft(null);
    }
  }

  function handleDelete(plan: AdminPlanRow) {
    if (!window.confirm(labels.deleteConfirm)) return;
    startTransition(async () => {
      setError(null);
      const r = await deletePlanAction(plan.id);
      if (!r.ok) setError(r.error ?? 'Failed');
    });
  }

  function renderTable(audience: PlanAudience, header: string) {
    const list = groups[audience];
    return (
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">{header}</h2>
        <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3 text-start">{labels.tier}</th>
                <th className="px-4 py-3 text-start">{labels.monthly}</th>
                <th className="px-4 py-3 text-start">{labels.yearly}</th>
                <th className="px-4 py-3 text-start">{labels.subs}</th>
                <th className="px-4 py-3 text-start">{labels.stripePriceId}</th>
                <th className="px-4 py-3 text-end">{labels.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    {labels.empty}
                  </td>
                </tr>
              ) : (
                list.map((p) => (
                  <tr key={p.id} className="transition hover:bg-brand-50/40">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.tier}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatMonthly(p.priceMonthly)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatMonthly(p.priceYearly)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{p.subscriptionsCount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {p.stripePriceId ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-end">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          className="rounded-lg bg-white/70 px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-white"
                        >
                          {labels.edit}
                        </button>
                        <button
                          type="button"
                          disabled={pending || p.subscriptionsCount > 0}
                          onClick={() => handleDelete(p)}
                          className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={
                            p.subscriptionsCount > 0
                              ? 'Cannot delete plans with active subscriptions'
                              : undefined
                          }
                        >
                          {labels.remove}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
        >
          + {labels.create}
        </button>
      </div>

      {renderTable('COMPANY', labels.companyHeader)}
      {renderTable('TRAINER', labels.trainerHeader)}

      {draft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <form
            action={handleSubmit}
            className="w-full max-w-lg space-y-3 rounded-2xl bg-white p-6 shadow-2xl"
          >
            <header className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
                {draft.mode === 'create' ? labels.createTitle : labels.editTitle}
              </h3>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="text-xl leading-none text-slate-400 hover:text-slate-700"
                aria-label={labels.dismiss}
              >
                ×
              </button>
            </header>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-700">{labels.audience}</span>
                <select
                  name="audience"
                  defaultValue={draft.plan?.audience ?? 'COMPANY'}
                  required
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                >
                  <option value="COMPANY">COMPANY</option>
                  <option value="TRAINER">TRAINER</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-700">{labels.tier}</span>
                <input
                  name="tier"
                  type="text"
                  required
                  minLength={2}
                  maxLength={40}
                  defaultValue={draft.plan?.tier ?? ''}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-700">
                  {labels.monthly} (cents)
                </span>
                <input
                  name="priceMonthly"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={draft.plan?.priceMonthly ?? 0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium text-slate-700">
                  {labels.yearly} (cents)
                </span>
                <input
                  name="priceYearly"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={draft.plan?.priceYearly ?? 0}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
                />
              </label>
            </div>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{labels.stripePriceId}</span>
              <input
                name="stripePriceId"
                type="text"
                maxLength={120}
                defaultValue={draft.plan?.stripePriceId ?? ''}
                placeholder="price_…"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400"
              />
            </label>

            <label className="block space-y-1 text-xs">
              <span className="font-medium text-slate-700">{labels.features} (JSON)</span>
              <textarea
                name="featuresJson"
                rows={5}
                defaultValue={
                  draft.plan ? JSON.stringify(draft.plan.featuresJson ?? {}, null, 2) : '{}'
                }
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-brand-400"
              />
            </label>

            {error ? <p className="text-xs text-rose-700">{error}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                {labels.dismiss}
              </button>
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                {labels.save}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
