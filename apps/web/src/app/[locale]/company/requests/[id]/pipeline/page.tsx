import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import type { EvaluationPipelineDto } from '@trainova/shared';
import { PipelineEditor } from './pipeline-editor';

interface TestRow {
  id: string;
  title: string;
  passingScore: number;
}

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER') redirect(`/${locale}`);

  const [pipeline, tests] = await Promise.all([
    authedFetch<EvaluationPipelineDto | null>(
      `/job-requests/${id}/evaluation-pipeline`,
    ).catch(() => null),
    authedFetch<TestRow[]>(`/tests?requestId=${id}`).catch(() => [] as TestRow[]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="text-xs">
        <Link
          href={`/${locale}/company/requests/${id}/applications`}
          className="text-brand-600 hover:text-brand-700"
        >
          ← {t('company.pipeline.backToApplications')}
        </Link>
      </div>
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-slate-900">{t('company.pipeline.title')}</h1>
        <p className="text-sm text-slate-600">{t('company.pipeline.description')}</p>
      </header>

      <PipelineEditor
        requestId={id}
        initialPipeline={pipeline}
        availableTests={tests.map((tt) => ({
          id: tt.id,
          title: tt.title,
          passingScore: tt.passingScore,
        }))}
      />
    </div>
  );
}
