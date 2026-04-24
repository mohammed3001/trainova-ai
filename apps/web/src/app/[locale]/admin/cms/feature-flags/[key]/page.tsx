import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { FeatureFlagForm } from '../_form';
import { deleteFeatureFlagAction } from '@/lib/cms-actions';

interface FlagRow {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  payload: unknown;
  updatedAt: string;
  createdAt: string;
}

export default async function EditCmsFeatureFlagPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const t = await getTranslations();
  const { key } = await params;
  const row = await authedFetch<FlagRow>(
    `/admin/cms/feature-flags/${encodeURIComponent(key)}`,
  );

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.featureFlags.edit')}
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-500">{row.key}</p>
        </div>
        <form action={deleteFeatureFlagAction}>
          <input type="hidden" name="key" value={row.key} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          >
            {t('admin.cms.delete')}
          </button>
        </form>
      </header>
      <FeatureFlagForm initial={row} />
      <details className="rounded-2xl border border-white/60 bg-white/60 p-3 text-sm text-slate-600 shadow-sm backdrop-blur-md">
        <summary className="cursor-pointer select-none font-semibold">
          {t('admin.jsonAccordion')}
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs text-slate-700">
          {JSON.stringify(row, null, 2)}
        </pre>
      </details>
    </div>
  );
}
