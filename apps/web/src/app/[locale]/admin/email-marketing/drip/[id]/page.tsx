import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ADMIN_ROLE_GROUPS, type EmailDripTrigger } from '@trainova/shared';
import { DripActions } from './drip-actions';
import { DripStepEditor } from './drip-step-editor';
import { DripEnrollmentsTable } from './drip-enrollments';

interface DripStep {
  id: string;
  order: number;
  delayMinutes: number;
  locale: 'en' | 'ar' | 'fr' | 'es';
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

interface DripSequence {
  id: string;
  name: string;
  slug: string;
  trigger: EmailDripTrigger;
  enabled: boolean;
  createdAt: string;
  steps: DripStep[];
  _count: { enrollments: number };
  createdBy: { id: string; name: string; email: string } | null;
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminDripSequenceDetailPage({ params }: PageProps) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const seq = await authedFetch<DripSequence>(`/admin/email/drip/${id}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            className="text-sm text-slate-500 hover:underline"
            href={`/${locale}/admin/email-marketing/drip`}
          >
            ← {t('admin.emailMarketing.drip.backToList')}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{seq.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {seq.slug} · {t(`admin.emailMarketing.drip.trigger.${seq.trigger}`)}
          </p>
        </div>
        <DripActions sequence={{ id: seq.id, enabled: seq.enabled }} />
      </header>

      <DripStepEditor sequenceId={seq.id} steps={seq.steps} />

      <section>
        <h2 className="mb-3 text-xl font-semibold text-slate-900">
          {t('admin.emailMarketing.drip.enrollments')}
        </h2>
        <DripEnrollmentsTable sequenceId={seq.id} />
      </section>
    </div>
  );
}
