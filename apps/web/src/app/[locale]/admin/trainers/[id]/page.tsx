import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { VerifiedBadge } from '@/components/admin/verified-badge';
import { ActionButton } from '@/components/admin/action-button';
import { setTrainerVerifiedAction } from '@/lib/admin-actions';

interface TrainerDetail {
  id: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  country: string | null;
  languages: string[];
  hourlyRateMin: number | null;
  hourlyRateMax: number | null;
  availability: string | null;
  verified: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    emailVerifiedAt: string | null;
    avatarUrl: string | null;
    _count: { applications: number };
  };
  skills: {
    level: string | null;
    yearsExperience: number | null;
    skill: { id: string; slug: string; nameEn: string; nameAr: string };
  }[];
  assets: { id: string; title: string | null; url: string; kind: string }[];
}

export default async function AdminTrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let trainer: TrainerDetail;
  try {
    trainer = await authedFetch<TrainerDetail>(`/admin/trainers/${id}`);
  } catch {
    notFound();
  }

  const skillName = (s: TrainerDetail['skills'][number]) =>
    locale === 'ar' ? s.skill.nameAr : s.skill.nameEn;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/trainers`} className="hover:text-brand-700">
          ← {t('admin.trainers.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div className="flex items-start gap-4">
          {trainer.user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={trainer.user.avatarUrl}
              alt=""
              className="h-16 w-16 rounded-full border border-slate-200 object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-fuchsia-500 text-2xl font-bold text-white">
              {trainer.user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{trainer.user.name}</h1>
            {trainer.headline && <p className="mt-1 text-sm text-slate-600">{trainer.headline}</p>}
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{trainer.slug}</span>
              {trainer.country && <span>· {trainer.country}</span>}
            </div>
            <div className="mt-2">
              <VerifiedBadge
                verified={trainer.verified}
                labelVerified={t('admin.common.verified')}
                labelUnverified={t('admin.common.unverified')}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <form action={setTrainerVerifiedAction}>
            <input type="hidden" name="id" value={trainer.id} />
            <input type="hidden" name="verified" value={trainer.verified ? 'false' : 'true'} />
            <ActionButton
              variant={trainer.verified ? 'ghost' : 'success'}
              confirm={
                trainer.verified
                  ? t('admin.trainers.confirm.unverify')
                  : t('admin.trainers.confirm.verify')
              }
            >
              {trainer.verified ? t('admin.trainers.action.unverify') : t('admin.trainers.action.verify')}
            </ActionButton>
          </form>
          <Link
            href={`/${locale}/trainers/${trainer.slug}`}
            target="_blank"
            className="rounded-lg border border-slate-200 bg-white/70 px-3 py-1.5 text-center text-xs font-semibold text-slate-700 hover:bg-white"
          >
            {t('admin.trainers.action.viewPublic')}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.trainers.section.profile')}
          </h2>
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">{t('admin.trainers.field.rate')}</dt>
            <dd className="text-slate-900">
              {trainer.hourlyRateMin != null && trainer.hourlyRateMax != null
                ? `${trainer.hourlyRateMin} – ${trainer.hourlyRateMax}`
                : '—'}
            </dd>
            <dt className="text-slate-500">{t('admin.trainers.field.availability')}</dt>
            <dd className="text-slate-900">{trainer.availability ?? '—'}</dd>
            <dt className="text-slate-500">{t('admin.trainers.field.languages')}</dt>
            <dd className="text-slate-900">
              {trainer.languages.length ? trainer.languages.join(', ') : '—'}
            </dd>
            <dt className="text-slate-500">{t('admin.users.applications')}</dt>
            <dd className="text-slate-900">{trainer.user._count.applications}</dd>
            <dt className="text-slate-500">{t('admin.users.col.created')}</dt>
            <dd className="text-slate-900">{new Date(trainer.createdAt).toLocaleString()}</dd>
          </dl>
          {trainer.bio && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {trainer.bio}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.trainers.section.user')}
          </h2>
          <Link
            href={`/${locale}/admin/users/${trainer.user.id}`}
            className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/50"
          >
            <div>
              <div className="font-semibold text-slate-900">{trainer.user.name}</div>
              <div className="font-mono text-xs text-slate-500">{trainer.user.email}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span>{t(`admin.userRole.${trainer.user.role}` as 'admin.userRole.TRAINER')}</span>
                <span>·</span>
                <span>{t(`admin.userStatus.${trainer.user.status}` as 'admin.userStatus.ACTIVE')}</span>
              </div>
            </div>
            <span className="text-slate-400">→</span>
          </Link>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.trainers.section.skills')} ({trainer.skills.length})
          </h2>
          {trainer.skills.length === 0 ? (
            <p className="mt-3 text-xs text-slate-500">{t('admin.trainers.noSkills')}</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {trainer.skills.map((s) => (
                <li
                  key={s.skill.id}
                  className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-50 to-fuchsia-50 px-3 py-1 text-xs text-slate-800"
                >
                  <span className="font-semibold">{skillName(s)}</span>
                  {s.level && <span className="text-slate-500">· {s.level}</span>}
                  {s.yearsExperience != null && (
                    <span className="text-slate-500">· {s.yearsExperience}y</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {trainer.assets.length > 0 && (
          <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {t('admin.trainers.section.portfolio')} ({trainer.assets.length})
            </h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {trainer.assets.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-200 bg-white/60 p-3 text-sm">
                  <div className="truncate font-semibold text-slate-900">{a.title ?? a.kind}</div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 block truncate font-mono text-xs text-brand-700 hover:underline"
                  >
                    {a.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
