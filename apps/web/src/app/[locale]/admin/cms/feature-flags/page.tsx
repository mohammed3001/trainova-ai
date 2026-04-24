import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { deleteFeatureFlagAction } from '@/lib/cms-actions';

interface Row {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  payload: unknown;
  updatedAt: string;
}

export default async function AdminCmsFeatureFlagsPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const rows = await authedFetch<Row[]>(`/admin/cms/feature-flags`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.featureFlags.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('admin.cms.featureFlags.subtitle')}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/cms/feature-flags/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.cms.featureFlags.new')}
        </Link>
      </header>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.featureFlags.col.key')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.featureFlags.col.enabled')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.featureFlags.col.description')}
              </th>
              <th className="px-4 py-3 text-start">
                {t('admin.cms.featureFlags.col.updated')}
              </th>
              <th className="px-4 py-3 text-end">
                {t('admin.cms.pages.col.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  {t('admin.cms.empty')}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="bg-white/40 hover:bg-white/70">
                  <td className="px-4 py-3 font-mono text-xs text-slate-900">
                    {r.key}
                  </td>
                  <td className="px-4 py-3">
                    {r.enabled ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        {t('admin.cms.featureFlags.on')}
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {t('admin.cms.featureFlags.off')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {r.description ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(r.updatedAt).toLocaleString(locale)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/${locale}/admin/cms/feature-flags/${encodeURIComponent(r.key)}`}
                        className="rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        {t('admin.cms.edit')}
                      </Link>
                      <form action={deleteFeatureFlagAction}>
                        <input type="hidden" name="key" value={r.key} />
                        <button
                          type="submit"
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          {t('admin.cms.delete')}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <details className="rounded-2xl border border-white/60 bg-white/60 p-3 text-sm text-slate-600 shadow-sm backdrop-blur-md">
        <summary className="cursor-pointer select-none font-semibold">
          {t('admin.jsonAccordion')}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">
          {JSON.stringify(rows, null, 2)}
        </pre>
      </details>
    </div>
  );
}
