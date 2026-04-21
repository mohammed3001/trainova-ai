import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface TrainerDetail {
  id: string;
  slug: string;
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone: string | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  verified: boolean;
  linkedinUrl: string | null;
  user: { id: string; name: string; createdAt: string };
  skills: {
    level: string;
    yearsExperience: number | null;
    skill: { nameEn: string; nameAr: string; slug: string };
  }[];
}

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  let t: TrainerDetail;
  try {
    t = await apiFetch<TrainerDetail>(`/trainers/${slug}`);
  } catch {
    notFound();
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{t.user.name}</h1>
            <p className="text-slate-500">{t.headline}</p>
            <p className="text-xs text-slate-400">
              {t.country ? t.country + ' · ' : ''}
              {t.languages.join(', ')}
            </p>
          </div>
          {t.verified ? <span className="badge-accent">Verified</span> : null}
        </div>
        {t.bio ? <p className="mt-4 whitespace-pre-line text-sm text-slate-700">{t.bio}</p> : null}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">Skills</h2>
        <ul className="mt-3 space-y-2">
          {t.skills.map((s) => (
            <li
              key={s.skill.slug}
              className="flex items-center justify-between rounded-md border border-slate-100 px-3 py-2 text-sm"
            >
              <span>{locale === 'ar' ? s.skill.nameAr : s.skill.nameEn}</span>
              <span className="text-xs text-slate-500">
                {s.level}
                {s.yearsExperience ? ` · ${s.yearsExperience}y` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
