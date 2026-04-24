import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { FaqForm } from '../_form';
import { deleteFaqAction } from '@/lib/cms-actions';

interface FaqRow {
  id: string;
  locale: string;
  section: string;
  question: string;
  answer: string;
  order: number;
  published: boolean;
  updatedAt: string;
  createdAt: string;
}

export default async function EditCmsFaqPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations();
  const { id } = await params;
  const row = await authedFetch<FaqRow>(`/admin/cms/faqs/${id}`);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.cms.faqs.edit')}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            {row.locale.toUpperCase()} · {row.section}
          </p>
        </div>
        <form action={deleteFaqAction}>
          <input type="hidden" name="id" value={row.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
          >
            {t('admin.cms.delete')}
          </button>
        </form>
      </header>
      <FaqForm initial={row} />
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
