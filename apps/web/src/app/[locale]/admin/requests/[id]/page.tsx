import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ActionButton } from '@/components/admin/action-button';
import { JsonAccordion } from '@/components/admin/json-accordion';
import {
  setRequestFeaturedAction,
  setRequestStatusAction,
} from '@/lib/admin-actions';

type Status = 'DRAFT' | 'OPEN' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';

interface RequestSkill {
  skillId: string;
  weight: number | null;
  skill: {
    id: string;
    slug: string;
    nameEn: string;
    nameAr: string | null;
    category: string;
  };
}

interface RequestDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: Status;
  featured: boolean;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  workType: string | null;
  currency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  durationWeeks: number | null;
  modality: string | null;
  applicationSchema: unknown;
  company: {
    id: string;
    name: string;
    slug: string;
    verified: boolean;
    ownerId: string;
  };
  skills: RequestSkill[];
  _count: {
    applications: number;
    tests: number;
    conversations: number;
    questions: number;
  };
}

const STATUSES: Status[] = ['DRAFT', 'OPEN', 'PAUSED', 'CLOSED', 'ARCHIVED'];

const STATUS_STYLE: Record<Status, string> = {
  DRAFT: 'bg-slate-50 text-slate-700 ring-slate-200',
  OPEN: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-700 ring-amber-200',
  CLOSED: 'bg-slate-200/70 text-slate-700 ring-slate-300',
  ARCHIVED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let row: RequestDetail;
  try {
    row = await authedFetch<RequestDetail>(`/admin/requests/${id}`);
  } catch {
    notFound();
  }

  const skillName = (s: RequestSkill) =>
    locale === 'ar' ? (s.skill.nameAr ?? s.skill.nameEn) : s.skill.nameEn;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/requests`} className="hover:text-brand-700">
          ← {t('admin.requests.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[row.status]}`}
            >
              {t(`admin.requests.status.${row.status}` as 'admin.requests.status.DRAFT')}
            </span>
            {row.featured ? (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                ★
              </span>
            ) : null}
            <Link
              href={`/${locale}/admin/companies/${row.company.id}`}
              className="text-xs text-brand-700 hover:underline"
            >
              {row.company.name}
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{row.title}</h1>
          <div className="mt-1 font-mono text-xs text-slate-400">{row.slug}</div>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.users.col.created')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {new Date(row.createdAt).toLocaleString()}
            </dd>
          </div>
          {row.publishedAt && (
            <div>
              <dt className="inline">Published:</dt>{' '}
              <dd className="inline text-slate-700">
                {new Date(row.publishedAt).toLocaleString()}
              </dd>
            </div>
          )}
          {row.closedAt && (
            <div>
              <dt className="inline">Closed:</dt>{' '}
              <dd className="inline text-slate-700">
                {new Date(row.closedAt).toLocaleString()}
              </dd>
            </div>
          )}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.requests.section.meta')}
          </h2>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {row.description}
          </div>
          <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-600 sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Work type</dt>
              <dd>{row.workType ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Modality</dt>
              <dd>{row.modality ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Budget</dt>
              <dd>
                {row.budgetMin != null || row.budgetMax != null
                  ? `${row.budgetMin ?? '—'} – ${row.budgetMax ?? '—'} ${row.currency ?? ''}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Duration (weeks)</dt>
              <dd>{row.durationWeeks ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.requests.section.counts')}
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-400">{t('admin.requests.col.applications')}</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {row._count.applications}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">{t('admin.requests.col.tests')}</dt>
                <dd className="text-lg font-semibold text-slate-900">{row._count.tests}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Conversations</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {row._count.conversations}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Schema questions</dt>
                <dd className="text-lg font-semibold text-slate-900">
                  {row._count.questions}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.requests.section.skills')}
            </h2>
            {row.skills.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">—</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {row.skills.map((s) => (
                  <li
                    key={s.skillId}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200"
                  >
                    {skillName(s)}
                    {s.weight != null ? (
                      <span className="text-brand-500/80">· {s.weight}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.requests.section.actions')}
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <form
            action={setRequestStatusAction}
            className="rounded-xl border border-slate-200 bg-white/70 p-4"
          >
            <input type="hidden" name="id" value={row.id} />
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.requests.action.changeStatus')}
            </label>
            <select
              name="status"
              defaultValue={row.status}
              className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`admin.requests.status.${s}` as 'admin.requests.status.DRAFT')}
                </option>
              ))}
            </select>
            <textarea
              name="reason"
              rows={2}
              placeholder={t('admin.requests.action.reasonPlaceholder')}
              className="mb-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
            />
            <ActionButton variant="primary" confirm={t('admin.requests.confirm.status')}>
              {t('admin.requests.action.setStatus')}
            </ActionButton>
          </form>

          <form
            action={setRequestFeaturedAction}
            className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white/70 p-4"
          >
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="featured" value={row.featured ? 'false' : 'true'} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('admin.requests.col.featured')}
              </div>
              <div className="mt-1 text-sm text-slate-800">
                {row.featured ? '★ Featured' : 'Not featured'}
              </div>
            </div>
            <div className="mt-3">
              <ActionButton
                variant={row.featured ? 'ghost' : 'success'}
                confirm={t('admin.requests.confirm.featured')}
              >
                {row.featured
                  ? t('admin.requests.action.unfeature')
                  : t('admin.requests.action.feature')}
              </ActionButton>
            </div>
          </form>
        </div>
      </section>

      <JsonAccordion title="Raw JSON" data={row} />
    </div>
  );
}
