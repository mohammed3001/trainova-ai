import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';

interface Stats {
  companies: number;
  trainers: number;
  openRequests: number;
}

async function fetchStats(): Promise<Stats> {
  try {
    return await apiFetch<Stats>('/public/stats');
  } catch {
    return { companies: 0, trainers: 0, openRequests: 0 };
  }
}

export default async function LandingPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const stats = await fetchStats();

  return (
    <div className="flex flex-col gap-16">
      <section className="flex flex-col items-start gap-6 py-8 md:py-16">
        <span className="badge">{t('common.tagline')}</span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          {t('landing.heroTitle')}
        </h1>
        <p className="max-w-2xl text-lg text-slate-600">{t('landing.heroBody')}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/${locale}/register?role=COMPANY_OWNER`} className="btn-primary">
            {t('landing.heroCtaCompany')}
          </Link>
          <Link href={`/${locale}/register?role=TRAINER`} className="btn-secondary">
            {t('landing.heroCtaTrainer')}
          </Link>
          <Link href={`/${locale}/requests`} className="btn-ghost">
            {t('common.browseRequests')}
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-3 gap-6 text-center text-sm text-slate-600">
          <Stat label={t('landing.statsCompanies')} value={stats.companies} />
          <Stat label={t('landing.statsTrainers')} value={stats.trainers} />
          <Stat label={t('landing.statsRequests')} value={stats.openRequests} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Pillar
          title={t('landing.pillars.marketplaceTitle')}
          body={t('landing.pillars.marketplaceBody')}
        />
        <Pillar title={t('landing.pillars.evalTitle')} body={t('landing.pillars.evalBody')} />
        <Pillar
          title={t('landing.pillars.workspaceTitle')}
          body={t('landing.pillars.workspaceBody')}
        />
      </section>

      <section className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-8 text-white md:p-12">
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-bold md:text-3xl">{t('landing.plansTitle')}</h2>
          <p className="text-brand-50/90">{t('landing.plansSub')}</p>
          <div className="flex gap-3">
            <Link href={`/${locale}/pricing`} className="btn bg-white text-brand-700 hover:bg-brand-50">
              {t('common.pricing')}
            </Link>
            <Link href={`/${locale}/register`} className="btn border border-white/40 text-white hover:bg-white/10">
              {t('common.getStarted')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-3xl font-bold text-brand-700">{value.toLocaleString()}</div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function Pillar({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
