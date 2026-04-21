import Link from 'next/link';
import { getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';

interface Skill {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  category: string;
}

export default async function SkillsPage() {
  const locale = await getLocale();
  const skills = await apiFetch<Skill[]>('/skills').catch(() => []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">AI Training Skills</h1>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {skills.map((s) => (
          <li key={s.id}>
            <Link
              href={`/${locale}/skills/${s.slug}`}
              className="block rounded-lg border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
            >
              {locale === 'ar' ? s.nameAr : s.nameEn}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
