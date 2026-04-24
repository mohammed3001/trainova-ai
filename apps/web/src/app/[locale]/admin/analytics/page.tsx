import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { Sparkline } from '@/components/admin/sparkline';
import { JsonAccordion } from '@/components/admin/json-accordion';

interface Series {
  day: string;
  count: number;
}

interface Analytics {
  windowDays: number;
  series: {
    signups: Series[];
    requests: Series[];
    applications: Series[];
    attempts: Series[];
    messages: Series[];
    reports: Series[];
  };
  breakdowns: {
    signupsByRole: Array<{ role: string; count: number }>;
    requestsByStatus: Array<{ status: string; count: number }>;
    reportsByStatus: Array<{ status: string; count: number }>;
  };
  generatedAt: string;
}

const WINDOWS = [7, 30, 90] as const;
const SERIES_KEYS = [
  'signups',
  'requests',
  'applications',
  'attempts',
  'messages',
  'reports',
] as const;

const SERIES_STYLE: Record<
  (typeof SERIES_KEYS)[number],
  { stroke: string; fill: string }
> = {
  signups: { stroke: '#2563eb', fill: 'rgba(37, 99, 235, 0.12)' },
  requests: { stroke: '#16a34a', fill: 'rgba(22, 163, 74, 0.12)' },
  applications: { stroke: '#7c3aed', fill: 'rgba(124, 58, 237, 0.12)' },
  attempts: { stroke: '#0891b2', fill: 'rgba(8, 145, 178, 0.12)' },
  messages: { stroke: '#ea580c', fill: 'rgba(234, 88, 12, 0.12)' },
  reports: { stroke: '#dc2626', fill: 'rgba(220, 38, 38, 0.12)' },
};

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const sp = await searchParams;

  const requested = Number.parseInt(sp.days ?? '', 10);
  const days = ([7, 30, 90] as number[]).includes(requested) ? requested : 30;

  const data = await authedFetch<Analytics>(`/admin/analytics?days=${days}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('admin.analytics.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('admin.analytics.subtitle')}</p>
          <p className="mt-1 text-xs text-slate-400">
            {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2 rounded-2xl border border-white/60 bg-white/70 p-1 shadow-sm backdrop-blur-md">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={{ pathname: `/${locale}/admin/analytics`, query: { days: w } }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                days === w
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t('admin.analytics.window', { days: w })}
            </Link>
          ))}
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SERIES_KEYS.map((key) => {
          const series = data.series[key];
          const style = SERIES_STYLE[key];
          return (
            <article
              key={key}
              className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  {t(`admin.analytics.series.${key}` as 'admin.analytics.series.signups')}
                </h2>
                <span
                  className="inline-block h-2 w-8 rounded-full"
                  style={{ backgroundColor: style.stroke }}
                  aria-hidden
                />
              </div>
              <div className="mt-3">
                <Sparkline data={series} stroke={style.stroke} fill={style.fill} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <article className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.analytics.breakdown.signupsByRole')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.breakdowns.signupsByRole.length === 0 ? (
              <li className="text-slate-500">{t('admin.analytics.empty')}</li>
            ) : (
              data.breakdowns.signupsByRole.map((row) => (
                <li key={row.role} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-700">{row.role}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.analytics.breakdown.requestsByStatus')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.breakdowns.requestsByStatus.length === 0 ? (
              <li className="text-slate-500">{t('admin.analytics.empty')}</li>
            ) : (
              data.breakdowns.requestsByStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-700">{row.status}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </li>
              ))
            )}
          </ul>
        </article>

        <article className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.analytics.breakdown.reportsByStatus')}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.breakdowns.reportsByStatus.length === 0 ? (
              <li className="text-slate-500">{t('admin.analytics.empty')}</li>
            ) : (
              data.breakdowns.reportsByStatus.map((row) => (
                <li key={row.status} className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-700">{row.status}</span>
                  <span className="font-semibold text-slate-900">{row.count}</span>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <JsonAccordion title="Raw JSON" data={data} />
    </div>
  );
}
