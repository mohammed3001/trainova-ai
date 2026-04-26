import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { getToken } from '@/lib/session';

interface MyEnrollment {
  id: string;
  enrolledAt: string;
  completedAt: string | null;
  path: {
    id: string;
    slug: string;
    title: string;
    summary: string;
    level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
    estimatedHours: number;
    _count: { steps: number };
  };
  certificate: { serial: string; issuedAt: string } | null;
  _count: { progress: number };
}

export default async function MyLearningPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const token = await getToken();
  if (!token) {
    redirect(`/${locale}/login?redirect=/${locale}/learning/me`);
  }
  const t = await getTranslations({ locale, namespace: 'learning' });
  const items = await authedFetch<MyEnrollment[]>('/learning-paths/me/enrollments');

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-12">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{t('me.title')}</h1>
        <p className="mt-2 text-slate-600">{t('me.subtitle')}</p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-10 text-center text-slate-500">
          {t('me.empty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">
                    <Link
                      href={`/${locale}/learning/${e.path.slug}`}
                      className="hover:underline"
                    >
                      {e.path.title}
                    </Link>
                  </h2>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {e.path.summary}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    {t(`level.${e.path.level}`)} ·{' '}
                    {t('me.progress', {
                      done: e._count.progress,
                      total: e.path._count.steps,
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.completedAt ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      {t('detail.completed')}
                    </span>
                  ) : null}
                  {e.certificate ? (
                    <a
                      href={`/${locale}/certificates/${e.certificate.serial}`}
                      className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      {t('detail.viewCertificate')}
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
