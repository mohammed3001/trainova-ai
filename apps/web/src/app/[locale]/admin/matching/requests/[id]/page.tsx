import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { TrainerMatch } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { formatCents } from '@/lib/format-money';
import { TrainerMatchCard } from '@/components/matching/trainer-match-card';

export const dynamic = 'force-dynamic';

interface AdminRequestDetail {
  id: string;
  slug: string;
  title: string;
  status: string;
  workType: string | null;
  currency: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  company: { id: string; name: string; slug: string };
}

export default async function AdminMatchingRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ minScore?: string; limit?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations();

  const limit = clampInt(sp.limit, 5, 50, 25);
  const minScore = sp.minScore ? clampInt(sp.minScore, 0, 100, 0) : undefined;

  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (minScore !== undefined) qs.set('minScore', String(minScore));

  const [request, matches] = await Promise.all([
    authedFetch<AdminRequestDetail>(`/admin/requests/${id}`).catch(() => null),
    authedFetch<TrainerMatch[]>(
      `/admin/matching/requests/${id}/trainers?${qs.toString()}`,
    ).catch(() => [] as TrainerMatch[]),
  ]);

  if (!request) notFound();

  const avg =
    matches.length > 0
      ? Math.round(
          matches.reduce((s, m) => s + m.score, 0) / matches.length,
        )
      : 0;
  const verified = matches.filter((m) => m.breakdown.trust.verified).length;
  const requiredOk = matches.filter(
    (m) => m.breakdown.skills.requiredSatisfied,
  ).length;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/${locale}/admin/requests/${id}`}
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          ← {t('matching.admin.backToRequest')}
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('matching.admin.title')}
        </h1>
        <p className="text-sm text-slate-500">
          {t('matching.admin.subtitle', {
            title: request.title,
            company: request.company.name,
          })}
        </p>
        {request.budgetMin !== null || request.budgetMax !== null ? (
          <p className="text-xs text-slate-500">
            {budgetLabel(request, locale)}
          </p>
        ) : null}
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t('matching.admin.statTotal')}
          value={String(matches.length)}
        />
        <Stat
          label={t('matching.admin.statAvgScore')}
          value={String(avg)}
        />
        <Stat
          label={t('matching.admin.statVerified', { verified, required: requiredOk })}
          value={`${verified}/${matches.length}`}
        />
      </section>

      <form className="card flex flex-wrap items-end gap-3" method="get">
        <label className="block text-xs font-medium text-slate-600">
          <span className="block">{t('matching.admin.filterMinScore')}</span>
          <input
            name="minScore"
            type="number"
            min={0}
            max={100}
            defaultValue={minScore ?? ''}
            placeholder="0"
            className="mt-1 w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          <span className="block">{t('matching.admin.filterLimit')}</span>
          <input
            name="limit"
            type="number"
            min={5}
            max={50}
            defaultValue={limit}
            className="mt-1 w-24 rounded-md border border-slate-200 bg-white px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          {t('matching.admin.applyFilter')}
        </button>
      </form>

      {matches.length === 0 ? (
        <div className="card text-sm text-slate-500">
          {t('matching.admin.empty')}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <li key={m.trainerId}>
              <TrainerMatchCard
                match={m}
                locale={locale}
                viewerRole="ADMIN"
                trainerHref={`/${locale}/admin/trainers/${m.trainerId}`}
                rateLabel={rateLabel(m, locale)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function budgetLabel(r: AdminRequestDetail, locale: string): string {
  const cur = r.currency ?? 'USD';
  const fmt = (cents: number) => formatCents(cents, cur, locale);
  if (r.budgetMin !== null && r.budgetMax !== null) {
    return `${fmt(r.budgetMin)} – ${fmt(r.budgetMax)}`;
  }
  if (r.budgetMin !== null) return `≥ ${fmt(r.budgetMin)}`;
  if (r.budgetMax !== null) return `≤ ${fmt(r.budgetMax)}`;
  return '';
}

function rateLabel(m: TrainerMatch, locale: string): string {
  const fmt = (cents: number) => formatCents(cents, m.currency, locale);
  if (m.hourlyRateMin !== null && m.hourlyRateMax !== null) {
    return `${fmt(m.hourlyRateMin)} – ${fmt(m.hourlyRateMax)}`;
  }
  if (m.hourlyRateMin !== null) return `≥ ${fmt(m.hourlyRateMin)}`;
  if (m.hourlyRateMax !== null) return `≤ ${fmt(m.hourlyRateMax)}`;
  return '';
}

function clampInt(
  raw: string | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}
