'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { FileDropzone } from '@/components/FileDropzone';
import { deleteAsset, UploadError } from '@/lib/uploads/client';

const LEVELS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
type Level = (typeof LEVELS)[number];

interface PortfolioAsset {
  id: string;
  kind: string;
  url: string;
  title: string | null;
  mimeType: string;
  byteLength: number;
  order: number;
  createdAt: string;
}

interface Profile {
  id: string;
  headline: string;
  bio: string | null;
  country: string | null;
  languages: string[];
  timezone?: string | null;
  availability?: string | null;
  responseTimeHours?: number | null;
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  skills: {
    level?: string | null;
    yearsExperience?: number | null;
    skill: { slug: string; nameEn: string; nameAr: string };
  }[];
  user: { id: string; avatarUrl: string | null };
  assets: PortfolioAsset[];
}
interface Skill {
  slug: string;
  nameEn: string;
  nameAr: string;
  category?: string;
}
interface SkillSelection {
  slug: string;
  level?: Level;
  yearsExperience?: number;
}

export function ProfileForm({ profile, skills }: { profile: Profile; skills: Skill[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();

  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Fields tracked in state so we can recompute completeness in real time.
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [country, setCountry] = useState(profile.country ?? '');
  const [languages, setLanguages] = useState<string[]>(profile.languages ?? []);
  const [languageDraft, setLanguageDraft] = useState('');
  const [timezone, setTimezone] = useState(profile.timezone ?? '');
  const [availability, setAvailability] = useState(profile.availability ?? '');
  const [responseTimeHours, setResponseTimeHours] = useState<string>(
    profile.responseTimeHours?.toString() ?? '',
  );
  const [hourlyRateMin, setHourlyRateMin] = useState<string>(
    profile.hourlyRateMin?.toString() ?? '',
  );
  const [hourlyRateMax, setHourlyRateMax] = useState<string>(
    profile.hourlyRateMax?.toString() ?? '',
  );
  const [linkedinUrl, setLinkedinUrl] = useState(profile.linkedinUrl ?? '');
  const [githubUrl, setGithubUrl] = useState(profile.githubUrl ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(profile.websiteUrl ?? '');

  const [selected, setSelected] = useState<SkillSelection[]>(
    profile.skills.map((s) => ({
      slug: s.skill.slug,
      level: (LEVELS as readonly string[]).includes(s.level ?? '')
        ? (s.level as Level)
        : undefined,
      yearsExperience: s.yearsExperience ?? undefined,
    })),
  );
  const [skillSearch, setSkillSearch] = useState('');

  const selectedSet = useMemo(() => new Set(selected.map((s) => s.slug)), [selected]);
  const filteredAvailable = useMemo(() => {
    const q = skillSearch.trim().toLowerCase();
    return skills
      .filter((s) => !selectedSet.has(s.slug))
      .filter((s) => {
        if (!q) return true;
        return (
          s.nameEn.toLowerCase().includes(q) ||
          s.nameAr.includes(q) ||
          s.slug.includes(q) ||
          (s.category ?? '').toLowerCase().includes(q)
        );
      })
      .slice(0, 60);
  }, [skills, selectedSet, skillSearch]);

  const completeness = computeCompleteness({
    headline,
    bio,
    country,
    languages,
    hourlyRateMin,
    hourlyRateMax,
    skillsCount: selected.length,
    linkedinUrl,
    websiteUrl,
  });

  function addLanguage() {
    const v = languageDraft.trim();
    if (!v) return;
    if (languages.includes(v)) {
      setLanguageDraft('');
      return;
    }
    setLanguages([...languages, v]);
    setLanguageDraft('');
  }
  function removeLanguage(v: string) {
    setLanguages(languages.filter((l) => l !== v));
  }
  function addSkill(slug: string) {
    if (selectedSet.has(slug)) return;
    setSelected([...selected, { slug }]);
  }
  function removeSkill(slug: string) {
    setSelected(selected.filter((s) => s.slug !== slug));
  }
  function patchSkill(slug: string, patch: Partial<SkillSelection>) {
    setSelected(selected.map((s) => (s.slug === slug ? { ...s, ...patch } : s)));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const min = hourlyRateMin ? Number(hourlyRateMin) : undefined;
    const max = hourlyRateMax ? Number(hourlyRateMax) : undefined;
    if (min !== undefined && max !== undefined && min > max) {
      setMsg({ kind: 'error', text: t('profile.trainer.rateOrderError') });
      return;
    }
    setPending(true);
    // URL fields must send '' (not undefined) when the user has cleared a
    // previously-set value so the API actually nulls the field. The Zod
    // schema accepts `.url().or(z.literal(''))` specifically to support this.
    const urlField = (current: string, original: string | null) => {
      const trimmed = current.trim();
      if (trimmed) return trimmed;
      if (original) return '';
      return undefined;
    };
    const payload = {
      headline: headline.trim(),
      bio: bio.trim() || undefined,
      country: country.trim() || undefined,
      languages,
      timezone: timezone.trim() || undefined,
      availability: availability.trim() || undefined,
      responseTimeHours: responseTimeHours ? Number(responseTimeHours) : undefined,
      hourlyRateMin: min,
      hourlyRateMax: max,
      linkedinUrl: urlField(linkedinUrl, profile.linkedinUrl),
      githubUrl: urlField(githubUrl, profile.githubUrl),
      websiteUrl: urlField(websiteUrl, profile.websiteUrl),
      skills: selected.map((s) => ({
        slug: s.slug,
        level: s.level,
        yearsExperience: s.yearsExperience,
      })),
    };
    const res = await fetch('/api/proxy/trainers/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const message = (body as { message?: string })?.message ?? t('common.error');
      setMsg({ kind: 'error', text: t('profile.trainer.saveFailed', { message }) });
      return;
    }
    setMsg({ kind: 'success', text: t('profile.trainer.saved') });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <CompletenessCard completeness={completeness} />

      <AvatarSection
        userId={profile.user.id}
        avatarUrl={profile.user.avatarUrl}
      />

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.trainer.sections.basics')}
        </h2>
        <Field label={t('profile.trainer.fields.headline')} help={t('profile.trainer.fields.headlineHelp')}>
          <input
            className="input"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={160}
            required
          />
        </Field>
        <Field label={t('profile.trainer.fields.bio')} help={t('profile.trainer.fields.bioHelp')}>
          <textarea
            className="input min-h-[140px]"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={4000}
          />
          <div className="mt-1 text-xs text-slate-400">{bio.length} / 4000</div>
        </Field>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t('profile.trainer.fields.country')}>
            <input
              className="input"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              maxLength={80}
            />
          </Field>
          <Field label={t('profile.trainer.fields.timezone')} help={t('profile.trainer.fields.timezoneHelp')}>
            <input
              className="input"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              maxLength={80}
              placeholder="Asia/Riyadh"
            />
          </Field>
        </div>
        <Field label={t('profile.trainer.fields.languages')} help={t('profile.trainer.fields.languagesHelp')}>
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
            {languages.map((l) => (
              <span
                key={l}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700"
              >
                {l}
                <button
                  type="button"
                  onClick={() => removeLanguage(l)}
                  className="text-brand-500 hover:text-brand-800"
                  aria-label={t('profile.trainer.skills.removeCta')}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[120px] border-0 bg-transparent p-1 text-sm outline-none"
              value={languageDraft}
              onChange={(e) => setLanguageDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addLanguage();
                } else if (e.key === 'Backspace' && !languageDraft && languages.length) {
                  setLanguages(languages.slice(0, -1));
                }
              }}
              onBlur={addLanguage}
              placeholder="English"
            />
          </div>
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.trainer.sections.rates')}
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t('profile.trainer.fields.hourlyRateMin')}>
            <input
              className="input"
              type="number"
              min={0}
              value={hourlyRateMin}
              onChange={(e) => setHourlyRateMin(e.target.value)}
            />
          </Field>
          <Field label={t('profile.trainer.fields.hourlyRateMax')}>
            <input
              className="input"
              type="number"
              min={0}
              value={hourlyRateMax}
              onChange={(e) => setHourlyRateMax(e.target.value)}
            />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label={t('profile.trainer.fields.availability')} help={t('profile.trainer.fields.availabilityHelp')}>
            <input
              className="input"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label={t('profile.trainer.fields.responseTimeHours')}>
            <input
              className="input"
              type="number"
              min={0}
              max={720}
              value={responseTimeHours}
              onChange={(e) => setResponseTimeHours(e.target.value)}
            />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.trainer.sections.links')}
        </h2>
        <Field label={t('profile.trainer.fields.linkedinUrl')}>
          <input
            className="input"
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://www.linkedin.com/in/…"
          />
        </Field>
        <Field label={t('profile.trainer.fields.githubUrl')}>
          <input
            className="input"
            type="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/…"
          />
        </Field>
        <Field label={t('profile.trainer.fields.websiteUrl')}>
          <input
            className="input"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.trainer.sections.skills')}
        </h2>
        <div>
          {selected.length === 0 ? (
            <p className="text-sm text-slate-500">{t('profile.trainer.skills.noneSelected')}</p>
          ) : (
            <ul className="space-y-2">
              {selected.map((s) => {
                const meta = skills.find((k) => k.slug === s.slug);
                const label = meta ? (locale === 'ar' ? meta.nameAr : meta.nameEn) : s.slug;
                return (
                  <li
                    key={s.slug}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2"
                  >
                    <span className="min-w-[160px] text-sm font-medium text-slate-900">{label}</span>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      {t('profile.trainer.skills.levelLabel')}
                      <select
                        value={s.level ?? ''}
                        onChange={(e) =>
                          patchSkill(s.slug, { level: (e.target.value || undefined) as Level | undefined })
                        }
                        className="input h-8 py-0 text-xs"
                      >
                        <option value="">—</option>
                        {LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {t(`profile.trainer.skills.levels.${lvl}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      {t('profile.trainer.skills.yearsLabel')}
                      <input
                        className="input h-8 w-16 py-0 text-xs"
                        type="number"
                        min={0}
                        max={60}
                        value={s.yearsExperience ?? ''}
                        onChange={(e) =>
                          patchSkill(s.slug, {
                            yearsExperience: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeSkill(s.slug)}
                      className="ms-auto text-xs text-rose-600 hover:underline"
                    >
                      {t('profile.trainer.skills.removeCta')}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <input
            className="input"
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            placeholder={t('profile.trainer.skills.searchPlaceholder')}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {filteredAvailable.length === 0 ? (
              <span className="text-sm text-slate-500">
                {t('profile.trainer.skills.noResults')}
              </span>
            ) : (
              filteredAvailable.map((s) => (
                <button
                  type="button"
                  key={s.slug}
                  onClick={() => addSkill(s.slug)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-brand-300 hover:text-brand-700"
                >
                  + {locale === 'ar' ? s.nameAr : s.nameEn}
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <PortfolioSection profileId={profile.id} assets={profile.assets} />

      {msg ? (
        <div
          role={msg.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-md p-3 text-sm ${
            msg.kind === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn-primary disabled:opacity-60">
          {pending ? t('common.loading') : t('profile.trainer.save')}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
      {help ? <p className="mt-1 text-xs text-slate-500">{help}</p> : null}
    </div>
  );
}

interface Completeness {
  pct: number;
  missing: string[];
}

function computeCompleteness(input: {
  headline: string;
  bio: string;
  country: string;
  languages: string[];
  hourlyRateMin: string;
  hourlyRateMax: string;
  skillsCount: number;
  linkedinUrl: string;
  websiteUrl: string;
}): Completeness {
  const checks: Array<{ key: string; ok: boolean }> = [
    { key: 'headline', ok: !!input.headline.trim() },
    { key: 'bio', ok: input.bio.trim().length >= 40 },
    { key: 'country', ok: !!input.country.trim() },
    { key: 'languages', ok: input.languages.length >= 1 },
    {
      key: 'hourlyRate',
      ok: !!input.hourlyRateMin && !!input.hourlyRateMax,
    },
    { key: 'skills', ok: input.skillsCount >= 3 },
    {
      key: 'linkedinOrWebsite',
      ok: !!(input.linkedinUrl.trim() || input.websiteUrl.trim()),
    },
  ];
  const satisfied = checks.filter((c) => c.ok).length;
  const pct = Math.round((satisfied / checks.length) * 100);
  return { pct, missing: checks.filter((c) => !c.ok).map((c) => c.key) };
}

function CompletenessCard({ completeness }: { completeness: Completeness }) {
  const t = useTranslations();
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">
          {t('profile.trainer.completeness.title')}
        </h2>
        <span className="text-sm font-semibold text-brand-700">{completeness.pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full bg-brand-600 transition-all"
          style={{ width: `${completeness.pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">
        {t('profile.trainer.completeness.lead', { pct: completeness.pct })}
      </p>
      {completeness.missing.length ? (
        <div className="text-xs text-slate-600">
          <span className="font-medium">{t('profile.trainer.completeness.missing')} </span>
          {completeness.missing
            .map((k) => t(`profile.trainer.completeness.fields.${k}`))
            .join(' · ')}
        </div>
      ) : null}
    </section>
  );
}

function AvatarSection({
  userId,
  avatarUrl,
}: {
  userId: string;
  avatarUrl: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRemove() {
    setError(null);
    setBusy(true);
    try {
      await deleteAsset({ kind: 'trainer-avatar', entityId: userId, assetId: 'current' });
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('profile.trainer.sections.avatar')}
      </h2>
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
              {t('profile.uploads.avatarPlaceholder')}
            </div>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <FileDropzone
            kind="trainer-avatar"
            entityId={userId}
            label={t(avatarUrl ? 'profile.uploads.replaceAvatar' : 'profile.uploads.dropAvatar')}
            help={t('profile.uploads.avatarHelp')}
            disabled={busy}
            onUploaded={() => {
              setError(null);
              router.refresh();
            }}
          />
          {avatarUrl ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
            >
              {t('profile.uploads.remove')}
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PortfolioSection({
  profileId,
  assets,
}: {
  profileId: string;
  assets: PortfolioAsset[];
}) {
  const t = useTranslations();
  const router = useRouter();
  // Track in-flight deletes by id so two concurrent removes don't re-enable
  // each other's button when one finishes. The ref is the source of truth for
  // the synchronous re-entry guard (state reads are closure-stale on rapid
  // double-clicks); the state drives the button's disabled rendering.
  const busyRef = useRef<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  async function onRemove(assetId: string) {
    if (busyRef.current.has(assetId)) return;
    busyRef.current.add(assetId);
    setError(null);
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.add(assetId);
      return next;
    });
    try {
      await deleteAsset({
        kind: 'trainer-asset',
        entityId: profileId,
        assetId,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : t('common.error'));
    } finally {
      busyRef.current.delete(assetId);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(assetId);
        return next;
      });
    }
  }

  return (
    <section className="card space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('profile.trainer.sections.portfolio')}
        </h2>
        <span className="text-xs text-slate-500">
          {t('profile.uploads.portfolioHelp')}
        </span>
      </header>

      {assets.length === 0 ? (
        <p className="text-sm text-slate-500">
          {t('profile.uploads.portfolioEmpty')}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {assets.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                {a.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.url}
                    alt={a.title ?? ''}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                    PDF
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-sm font-medium text-slate-900 hover:text-brand-700"
                >
                  {a.title || a.url.split('/').pop()}
                </a>
                <p className="text-xs text-slate-500">
                  {Math.round(a.byteLength / 1024)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={busyIds.has(a.id)}
                className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-60"
              >
                {t('profile.uploads.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <FileDropzone
        kind="trainer-asset"
        entityId={profileId}
        label={t('profile.uploads.dropPortfolio')}
        help={t('profile.uploads.portfolioFormats')}
        multiple
        getTitleForFile={(f) => f.name.slice(0, 200)}
        onUploaded={() => {
          setError(null);
          router.refresh();
        }}
      />
      {error ? (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
