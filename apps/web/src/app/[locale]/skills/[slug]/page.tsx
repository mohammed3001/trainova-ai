import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface SkillDetail {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  trainerSkills: {
    profile: { slug: string; headline: string; country: string | null; user: { name: string } };
  }[];
  requestSkills: {
    request: {
      id: string;
      slug: string;
      title: string;
      modelFamily: string | null;
      industry: string | null;
      status: string;
      company: { name: string; slug: string };
    };
  }[];
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  let data: SkillDetail;
  try {
    data = await apiFetch<SkillDetail>(`/skills/${slug}`);
  } catch {
    notFound();
  }
  const name = locale === 'ar' ? data.nameAr : data.nameEn;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">{name}</h1>
        <p className="text-slate-500">Discover trainers and open requests for {data.nameEn}.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Top trainers</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.trainerSkills.map((ts) => (
            <li key={ts.profile.slug} className="card">
              <Link
                href={`/${locale}/trainers/${ts.profile.slug}`}
                className="font-semibold text-slate-900 hover:text-brand-700"
              >
                {ts.profile.user.name}
              </Link>
              <p className="text-xs text-slate-500">
                {ts.profile.headline}
                {ts.profile.country ? ` · ${ts.profile.country}` : ''}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Related open requests</h2>
        <ul className="space-y-3">
          {data.requestSkills
            .filter((rs) => rs.request.status === 'OPEN')
            .map((rs) => (
              <li key={rs.request.id} className="card">
                <Link
                  href={`/${locale}/requests/${rs.request.slug}`}
                  className="font-semibold text-slate-900 hover:text-brand-700"
                >
                  {rs.request.title}
                </Link>
                <p className="text-xs text-slate-500">
                  {rs.request.company.name}
                  {rs.request.modelFamily ? ` · ${rs.request.modelFamily}` : ''}
                </p>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
