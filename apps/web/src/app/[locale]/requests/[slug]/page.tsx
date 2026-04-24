import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getRole, getToken } from '@/lib/session';
import { applicationFormSchema, type ApplicationForm } from '@trainova/shared';
import { ApplyForm } from './apply-form';

interface RequestDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  objective: string | null;
  modelFamily: string | null;
  industry: string | null;
  languages: string[];
  durationDays: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  currency: string;
  workType: string;
  applicationSchema: unknown;
  company: { name: string; slug: string; country: string | null; industry: string | null; verified: boolean; description: string | null };
  skills: { skill: { id: string; slug: string; nameEn: string; nameAr: string } }[];
  questions: { id: string; prompt: string; type: string; options: string[] }[];
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);

  let req: RequestDetail;
  try {
    req = await apiFetch<RequestDetail>(`/job-requests/${slug}`);
  } catch {
    notFound();
  }

  let applicationSchema: ApplicationForm | null = null;
  if (req.applicationSchema) {
    const parsed = applicationFormSchema.safeParse(req.applicationSchema);
    if (parsed.success) applicationSchema = parsed.data;
  }

  return (
    <article className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="card">
        <h1 className="text-3xl font-bold text-slate-900">{req.title}</h1>
        <div className="mt-1 text-sm text-slate-500">
          <Link href={`/${locale}/companies/${req.company.slug}`} className="hover:text-brand-700">
            {req.company.name}
          </Link>
          {req.company.country ? ` · ${req.company.country}` : ''}
          {req.company.verified ? <span className="ms-2 badge-accent">Verified</span> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {req.skills.map((s) => (
            <span key={s.skill.id} className="badge">
              {locale === 'ar' ? s.skill.nameAr : s.skill.nameEn}
            </span>
          ))}
        </div>

        <section className="mt-6 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Description</h2>
          <p className="whitespace-pre-line text-sm text-slate-700">{req.description}</p>
        </section>

        {req.objective ? (
          <section className="mt-6 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Objective</h2>
            <p className="text-sm text-slate-700">{req.objective}</p>
          </section>
        ) : null}

        {req.questions.length ? (
          <section className="mt-6 space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">Screening questions</h2>
            <ol className="list-decimal space-y-2 ps-5 text-sm text-slate-700">
              {req.questions.map((q) => (
                <li key={q.id}>{q.prompt}</li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>

      <aside className="space-y-4">
        <div className="card space-y-2 text-sm text-slate-700">
          {req.modelFamily ? (
            <Row label={t('requests.model')} value={req.modelFamily} />
          ) : null}
          {req.industry ? <Row label={t('requests.industry')} value={req.industry} /> : null}
          {req.budgetMin || req.budgetMax ? (
            <Row
              label={t('requests.budget')}
              value={`${req.currency} ${req.budgetMin ?? 0}–${req.budgetMax ?? 0}`}
            />
          ) : null}
          {req.durationDays ? (
            <Row label={t('requests.duration')} value={`${req.durationDays} ${t('requests.days')}`} />
          ) : null}
          {req.languages?.length ? (
            <Row label="Languages" value={req.languages.join(', ')} />
          ) : null}
          <Row label="Work type" value={req.workType} />
        </div>

        {token && role === 'TRAINER' ? (
          <ApplyForm requestId={req.id} applicationSchema={applicationSchema} locale={locale} />
        ) : (
          <div className="card text-sm text-slate-600">
            <Link href={`/${locale}/login`} className="font-semibold text-brand-700 hover:underline">
              {t('common.signIn')}
            </Link>{' '}
            as a trainer to apply.
          </div>
        )}
      </aside>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}
