'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface Profile {
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  skills: { skill: { slug: string; nameEn: string } }[];
}
interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
}

export function ProfileForm({ profile, skills }: { profile: Profile; skills: Skill[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(profile.skills.map((s) => s.skill.slug));

  function toggleSkill(slug: string) {
    setSelected((prev) => (prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      headline: String(fd.get('headline') ?? ''),
      bio: (fd.get('bio') as string) || undefined,
      country: (fd.get('country') as string) || undefined,
      languages: String(fd.get('languages') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      hourlyRateMin: fd.get('hourlyRateMin') ? Number(fd.get('hourlyRateMin')) : undefined,
      hourlyRateMax: fd.get('hourlyRateMax') ? Number(fd.get('hourlyRateMax')) : undefined,
      linkedinUrl: (fd.get('linkedinUrl') as string) || undefined,
      githubUrl: (fd.get('githubUrl') as string) || undefined,
      websiteUrl: (fd.get('websiteUrl') as string) || undefined,
      skills: selected,
    };
    const res = await fetch('/api/proxy/trainers/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMsg(body?.message ?? 'Failed to save');
      return;
    }
    setMsg('Saved');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <F label="Headline" name="headline" defaultValue={profile.headline} required />
      <F label="Bio" name="bio" multiline defaultValue={profile.bio ?? ''} />
      <div className="grid grid-cols-2 gap-3">
        <F label="Country" name="country" defaultValue={profile.country ?? ''} />
        <F label="Languages (comma-separated)" name="languages" defaultValue={profile.languages.join(', ')} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <F label="Hourly rate min (USD)" name="hourlyRateMin" type="number" defaultValue={profile.hourlyRateMin?.toString() ?? ''} />
        <F label="Hourly rate max (USD)" name="hourlyRateMax" type="number" defaultValue={profile.hourlyRateMax?.toString() ?? ''} />
      </div>
      <F label="LinkedIn URL" name="linkedinUrl" defaultValue={profile.linkedinUrl ?? ''} />
      <F label="GitHub URL" name="githubUrl" defaultValue={profile.githubUrl ?? ''} />
      <F label="Website URL" name="websiteUrl" defaultValue={profile.websiteUrl ?? ''} />
      <div>
        <span className="label">Skills</span>
        <div className="flex flex-wrap gap-2">
          {skills.map((s) => {
            const active = selected.includes(s.slug);
            return (
              <button
                type="button"
                key={s.slug}
                onClick={() => toggleSkill(s.slug)}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                }`}
              >
                {s.nameEn}
              </button>
            );
          })}
        </div>
      </div>
      {msg ? (
        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{msg}</div>
      ) : null}
      <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
        {pending ? t('common.loading') : t('common.save')}
      </button>
    </form>
  );
}

function F({
  label,
  name,
  defaultValue,
  required,
  multiline,
  type = 'text',
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  type?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      {multiline ? (
        <textarea id={name} name={name} defaultValue={defaultValue} className="input min-h-[100px]" />
      ) : (
        <input id={name} name={name} defaultValue={defaultValue} type={type} required={required} className="input" />
      )}
    </div>
  );
}
