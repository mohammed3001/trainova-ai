import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations, getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { getRole, getToken } from '@/lib/session';
import { applicationFormSchema, type ApplicationForm } from '@trainova/shared';
import { ApplyForm } from './apply-form';
import { JsonLd } from '@/components/json-ld';
import {
  absoluteUrl,
  breadcrumbLd,
  buildMetadata,
  jobPostingLd,
  siteUrl,
} from '@/lib/seo';
import type { Locale } from '@/i18n/config';

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
  publishedAt?: string | null;
  updatedAt?: string | null;
  company: { name: string; slug: string; logoUrl?: string | null; country: string | null; industry: string | null; verified: boolean; description: string | null };
  skills: { skill: { id: string; slug: string; nameEn: string; nameAr: string } }[];
  questions: { id: string; prompt: string; type: string; options: string[] }[];
}

async function fetchRequest(slug: string): Promise<RequestDetail | null> {
  try {
    return await apiFetch<RequestDetail>(`/job-requests/${slug}`);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const req = await fetchRequest(slug);
  if (!req) return { robots: { index: false, follow: false } };
  const seoT = await getTranslations({ locale, namespace: 'seo.request' });
  const description =
    req.description.length > 0 ? req.description.slice(0, 300) : seoT('descriptionFallback');
  return buildMetadata({
    title: `${req.title} · ${req.company.name}`,
    description,
    path: `/requests/${req.slug}`,
    locale: locale as Locale,
    ogType: 'article',
    image: req.company.logoUrl ?? undefined,
  });
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

  const req = await fetchRequest(slug);
  if (!req) notFound();

  const pageUrl = absoluteUrl(`/requests/${req.slug}`, locale as Locale);
  const requestsIndexUrl = absoluteUrl('/requests', locale as Locale);
  const companyUrl = absoluteUrl(`/companies/${req.company.slug}`, locale as Locale);
  const seoT = await getTranslations({ locale, namespace: 'seo' });
  const commonT = await getTranslations({ locale, namespace: 'common' });
  const ld = [
    jobPostingLd({
      title: req.title,
      description: req.description,
      url: pageUrl,
      datePosted: req.publishedAt ?? null,
      validThrough: null,
      hiringOrgName: req.company.name,
      hiringOrgUrl: companyUrl,
      hiringOrgLogo: req.company.logoUrl ?? null,
      country: req.company.country,
      employmentType: mapWorkTypeToSchema(req.workType),
      skills: req.skills.map((s) => (locale === 'ar' ? s.skill.nameAr : s.skill.nameEn)),
      salaryMin: req.budgetMin,
      salaryMax: req.budgetMax,
      currency: req.currency,
    }),
    breadcrumbLd([
      { name: commonT('appName'), url: `${siteUrl()}/${locale}` },
      { name: seoT('requestsList.title'), url: requestsIndexUrl },
      { name: req.title, url: pageUrl },
    ]),
  ];

  let applicationSchema: ApplicationForm | null = null;
  if (req.applicationSchema) {
    const parsed = applicationFormSchema.safeParse(req.applicationSchema);
    if (parsed.success) applicationSchema = parsed.data;
  }

  return (
    <article className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr,1fr]">
      <JsonLd data={ld} />
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

/**
 * Translate our WorkType enum into Google JobPosting `employmentType` tokens
 * so rich results match. Anything unmapped is dropped rather than emitted as
 * an invalid value.
 */
function mapWorkTypeToSchema(workType: string): string | null {
  switch (workType) {
    case 'FULL_TIME':
      return 'FULL_TIME';
    case 'PART_TIME':
      return 'PART_TIME';
    case 'CONTRACT':
      return 'CONTRACTOR';
    case 'TEMPORARY':
      return 'TEMPORARY';
    case 'INTERN':
      return 'INTERN';
    default:
      return null;
  }
}
