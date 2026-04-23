import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { apiFetch } from '@/lib/api';
import { ProfileForm } from './form';

interface Profile {
  id: string;
  slug: string;
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone: string | null;
  availability: string | null;
  responseTimeHours: number | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  skills: {
    level: string | null;
    yearsExperience: number | null;
    skill: { slug: string; nameEn: string; nameAr: string };
  }[];
  user: { id: string; avatarUrl: string | null };
  assets: {
    id: string;
    kind: string;
    url: string;
    title: string | null;
    mimeType: string;
    byteLength: number;
    order: number;
    createdAt: string;
  }[];
}
interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
  category?: string;
}

export default async function TrainerProfilePage() {
  const locale = await getLocale();
  const t = await getTranslations();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const [profile, skills] = await Promise.all([
    authedFetch<Profile>('/trainers/me'),
    apiFetch<Skill[]>('/skills').catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('profile.trainer.title')}</h1>
        <p className="text-sm text-slate-500">{t('profile.trainer.subtitle')}</p>
      </header>
      <ProfileForm profile={profile} skills={skills} />
    </div>
  );
}
