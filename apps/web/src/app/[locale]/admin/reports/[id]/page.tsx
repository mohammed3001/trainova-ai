import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { ActionButton } from '@/components/admin/action-button';
import { JsonAccordion } from '@/components/admin/json-accordion';
import { reviewReportAction } from '@/lib/admin-actions';

type ReportStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
type ReportCategory =
  | 'SPAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE'
  | 'FRAUD'
  | 'IMPERSONATION'
  | 'COPYRIGHT'
  | 'SAFETY'
  | 'OTHER';
type ReportTarget =
  | 'USER'
  | 'COMPANY'
  | 'TRAINER'
  | 'REQUEST'
  | 'APPLICATION'
  | 'MESSAGE'
  | 'CONVERSATION'
  | 'REVIEW'
  | 'TEST'
  | 'OTHER';
type ReportResolution =
  | 'NO_ACTION'
  | 'WARNING_ISSUED'
  | 'CONTENT_REMOVED'
  | 'USER_SUSPENDED'
  | 'USER_BANNED'
  | 'ESCALATED';

interface ReportDetail {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  category: ReportCategory;
  status: ReportStatus;
  resolution: ReportResolution | null;
  reason: string;
  resolverNotes: string | null;
  evidenceUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
  reporter: { id: string; name: string; email: string; role: string };
  resolver: { id: string; name: string; email: string } | null;
  target: unknown;
}

const STATUSES: ReportStatus[] = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'DISMISSED'];
const RESOLUTIONS: ReportResolution[] = [
  'NO_ACTION',
  'WARNING_ISSUED',
  'CONTENT_REMOVED',
  'USER_SUSPENDED',
  'USER_BANNED',
  'ESCALATED',
];

const STATUS_STYLE: Record<ReportStatus, string> = {
  OPEN: 'bg-amber-50 text-amber-700 ring-amber-200',
  INVESTIGATING: 'bg-sky-50 text-sky-700 ring-sky-200',
  RESOLVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DISMISSED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let report: ReportDetail;
  try {
    report = await authedFetch<ReportDetail>(`/admin/reports/${id}`);
  } catch {
    notFound();
  }

  const terminal = report.status === 'RESOLVED' || report.status === 'DISMISSED';

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/reports`} className="hover:text-brand-700">
          ← {t('admin.reports.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLE[report.status]}`}
            >
              {t(`admin.reports.status.${report.status}` as 'admin.reports.status.OPEN')}
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {t(
                `admin.reports.category.${report.category}` as 'admin.reports.category.SPAM',
              )}
            </span>
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200">
              {t(
                `admin.reports.targetType.${report.targetType}` as 'admin.reports.targetType.USER',
              )}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {t('admin.reports.section.details')}
          </h1>
          <div className="mt-1 font-mono text-xs text-slate-500">
            {report.targetType}:{report.targetId}
          </div>
        </div>
        <dl className="grid gap-1 text-xs text-slate-500 sm:text-end">
          <div>
            <dt className="inline">{t('admin.reports.col.reporter')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {report.reporter.name} · {report.reporter.email}
            </dd>
          </div>
          <div>
            <dt className="inline">{t('admin.reports.col.createdAt')}:</dt>{' '}
            <dd className="inline text-slate-700">
              {new Date(report.createdAt).toLocaleString()}
            </dd>
          </div>
          {report.resolvedAt ? (
            <div>
              <dt className="inline">Resolved:</dt>{' '}
              <dd className="inline text-slate-700">
                {new Date(report.resolvedAt).toLocaleString()}
              </dd>
            </div>
          ) : null}
          {report.resolver ? (
            <div>
              <dt className="inline">By:</dt>{' '}
              <dd className="inline text-slate-700">{report.resolver.name}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.reports.section.reason')}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-800">{report.reason}</p>
          {report.evidenceUrls.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t('admin.reports.section.evidence')}
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {report.evidenceUrls.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all text-brand-700 hover:underline"
                    >
                      {url}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">{t('admin.reports.noEvidence')}</p>
          )}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.reports.section.target')}
          </h2>
          {report.target ? (
            <pre
              dir="ltr"
              className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-100"
            >
              {JSON.stringify(report.target, null, 2)}
            </pre>
          ) : (
            <p className="mt-3 text-sm text-slate-500">—</p>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          {t('admin.reports.section.review')}
        </h2>
        {terminal ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="text-slate-700">
              {t('admin.reports.section.closed', {
                status: t(
                  `admin.reports.status.${report.status}` as 'admin.reports.status.OPEN',
                ),
              })}
            </p>
            {report.resolution ? (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('admin.reports.col.resolution')}:
                </span>{' '}
                <span className="text-slate-700">
                  {t(
                    `admin.reports.resolution.${report.resolution}` as 'admin.reports.resolution.NO_ACTION',
                  )}
                </span>
              </div>
            ) : null}
            {report.resolverNotes ? (
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {t('admin.reports.action.notesLabel')}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">
                  {report.resolverNotes}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <form action={reviewReportAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="id" value={report.id} />

            <label className="text-xs font-semibold text-slate-500">
              {t('admin.reports.col.status')}
              <select
                name="status"
                defaultValue={report.status}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`admin.reports.status.${s}` as 'admin.reports.status.OPEN')}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500">
              {t('admin.reports.col.resolution')}
              <select
                name="resolution"
                defaultValue={report.resolution ?? ''}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              >
                <option value="">{t('admin.reports.action.noResolution')}</option>
                {RESOLUTIONS.map((r) => (
                  <option key={r} value={r}>
                    {t(
                      `admin.reports.resolution.${r}` as 'admin.reports.resolution.NO_ACTION',
                    )}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-semibold text-slate-500 sm:col-span-2">
              {t('admin.reports.action.notesLabel')}
              <textarea
                name="resolverNotes"
                rows={3}
                maxLength={4000}
                placeholder={t('admin.reports.action.notesPlaceholder')}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
              />
            </label>

            <div className="sm:col-span-2">
              <ActionButton
                variant="primary"
                confirm={t('admin.reports.confirm.submit')}
              >
                {t('admin.reports.action.submit')}
              </ActionButton>
            </div>
          </form>
        )}
      </section>

      <JsonAccordion title="Raw JSON" data={report} />
    </div>
  );
}
