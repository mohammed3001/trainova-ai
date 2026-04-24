import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import type { TrainerMatch } from '@trainova/shared';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { formatCents } from '@/lib/format-money';
import { TrainerMatchCard } from '@/components/matching/trainer-match-card';

export const dynamic = 'force-dynamic';

interface RequestDetail {
  id: string;
  title: string;
  slug: string;
}

export default async function SuggestedTrainersPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'COMPANY_OWNER' && role !== 'COMPANY_MEMBER') {
    redirect(`/${locale}`);
  }

  const [request, matches] = await Promise.all([
    authedFetch<RequestDetail>(`/job-requests/${id}`).catch(() => null),
    authedFetch<TrainerMatch[]>(
      `/company/requests/${id}/suggested-trainers?limit=20`,
    ).catch(() => [] as TrainerMatch[]),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/${locale}/company/requests/${id}/applications`}
          className="text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          ← {t('matching.company.backToApplications')}
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">
          {t('matching.company.title')}
        </h1>
        {request ? (
          <p className="text-sm text-slate-500">
            {t('matching.company.subtitle', { title: request.title })}
          </p>
        ) : null}
      </header>

      {matches.length === 0 ? (
        <div className="card text-sm text-slate-500">
          {t('matching.company.empty')}
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <li key={m.trainerId}>
              <TrainerMatchCard
                match={m}
                locale={locale}
                viewerRole="COMPANY"
                trainerHref={
                  m.slug ? `/${locale}/trainers/${m.slug}` : undefined
                }
                rateLabel={rateLabel(m, locale)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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
