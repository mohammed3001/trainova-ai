import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { requireAdminGroup } from '@/lib/admin-guard';

interface AdminPathRow {
  id: string;
  slug: string;
  title: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  industry: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { steps: number; enrollments: number };
}

export default async function AdminLearningPathsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  await requireAdminGroup('CONTENT', `/${locale}/admin/learning-paths`);
  const t = await getTranslations({ locale, namespace: 'learning' });
  const items = await authedFetch<AdminPathRow[]>('/admin/learning-paths');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/learning-paths/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.new')}
        </Link>
      </header>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 text-start">{t('admin.col.title')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.level')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.steps')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.enrollments')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.col.updated')}</th>
              <th className="px-4 py-3 text-end" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{p.title}</p>
                  <p className="text-xs text-slate-500">{p.slug}</p>
                </td>
                <td className="px-4 py-3 text-slate-600">{t(`level.${p.level}`)}</td>
                <td className="px-4 py-3 text-slate-600">{p._count.steps}</td>
                <td className="px-4 py-3 text-slate-600">{p._count.enrollments}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      p.isPublished
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {p.isPublished ? t('admin.status.published') : t('admin.status.draft')}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(p.updatedAt).toLocaleString(locale)}
                </td>
                <td className="px-4 py-3 text-end">
                  <Link
                    href={`/${locale}/admin/learning-paths/${p.id}`}
                    className="text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {t('admin.actions.open')}
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('list.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
