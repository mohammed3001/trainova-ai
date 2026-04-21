import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { apiFetch } from '@/lib/api';
import { ProfileForm } from './form';

interface Profile {
  slug: string;
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  skills: { skill: { slug: string; nameEn: string; nameAr: string } }[];
}
interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export default async function TrainerProfilePage() {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'TRAINER') redirect(`/${locale}`);

  const [profile, skills] = await Promise.all([
    authedFetch<Profile>('/trainers/me'),
    apiFetch<Skill[]>('/skills').catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">My Profile</h1>
      <ProfileForm profile={profile} skills={skills} />
    </div>
  );
}
