import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { requireAdminGroup } from '@/lib/admin-guard';
import { LearningPathForm, PublishToggleAndDelete } from '../_form';

interface AdminPathDetail {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  industry: string | null;
  estimatedHours: number;
  isPublished: boolean;
  steps: {
    id: string;
    position: number;
    kind: 'ARTICLE' | 'LINK' | 'VIDEO' | 'REFLECTION';
    title: string;
    body: string;
    url: string | null;
  }[];
}

export default async function EditLearningPathPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  await requireAdminGroup('CONTENT', `/${locale}/admin/learning-paths/${id}`);
  const t = await getTranslations({ locale, namespace: 'learning' });

  let path: AdminPathDetail;
  try {
    path = await authedFetch<AdminPathDetail>(`/admin/learning-paths/${id}`);
  } catch {
    notFound();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-3xl font-bold text-slate-900">{path.title}</h1>
        <PublishToggleAndDelete id={path.id} locale={locale} isPublished={path.isPublished} />
      </header>
      <LearningPathForm
        locale={locale}
        initial={{
          id: path.id,
          slug: path.slug,
          title: path.title,
          summary: path.summary,
          description: path.description,
          level: path.level,
          industry: path.industry,
          estimatedHours: path.estimatedHours,
          isPublished: path.isPublished,
          steps: path.steps.map((s) => ({
            kind: s.kind,
            title: s.title,
            body: s.body,
            url: s.url ?? '',
          })),
        }}
      />
      <p className="text-xs text-slate-500">{t('admin.subtitle')}</p>
    </div>
  );
}
