import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';

interface TrainerItem {
  id: string;
  slug: string;
  headline: string;
  country: string | null;
  languages: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  verified: boolean;
  user: { id: string; name: string };
  skills: { skill: { nameEn: string; nameAr: string; slug: string } }[];
}

export default async function TrainersPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const data = await apiFetch<{ items: TrainerItem[]; total: number }>('/trainers?limit=24').catch(() => ({
    items: [],
    total: 0,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">{t('trainers.listTitle')}</h1>
      {data.items.length === 0 ? (
        <div className="card text-sm text-slate-500">{t('trainers.noResults')}</div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((tr) => (
            <li key={tr.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/${locale}/trainers/${tr.slug}`} className="text-lg font-semibold text-slate-900 hover:text-brand-700">
                  {tr.user.name}
                </Link>
                {tr.verified ? <span className="badge-accent">Verified</span> : null}
              </div>
              <div className="text-xs text-slate-500">
                {tr.headline}
                {tr.country ? ` · ${tr.country}` : ''}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {tr.skills.slice(0, 4).map((s) => (
                  <span key={s.skill.slug} className="badge">
                    {locale === 'ar' ? s.skill.nameAr : s.skill.nameEn}
                  </span>
                ))}
              </div>
              {tr.hourlyRateMin || tr.hourlyRateMax ? (
                <div className="mt-3 text-sm text-slate-600">
                  {t('trainers.rate')}: ${tr.hourlyRateMin ?? 0}–${tr.hourlyRateMax ?? 0} /h
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
