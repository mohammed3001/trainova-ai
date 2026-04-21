import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { apiFetch } from '@/lib/api';

interface CompanyDetail {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  industry: string | null;
  size: string | null;
  description: string | null;
  verified: boolean;
  requests: {
    id: string;
    slug: string;
    title: string;
    modelFamily: string | null;
    industry: string | null;
    publishedAt: string | null;
  }[];
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  let c: CompanyDetail;
  try {
    c = await apiFetch<CompanyDetail>(`/companies/${slug}`);
  } catch {
    notFound();
  }
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <div className="card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{c.name}</h1>
            <p className="text-sm text-slate-500">
              {c.country ? `${c.country} · ` : ''}
              {c.industry ?? ''}
              {c.size ? ` · ${c.size}` : ''}
            </p>
          </div>
          {c.verified ? <span className="badge-accent">Verified</span> : null}
        </div>
        {c.description ? <p className="mt-4 text-sm text-slate-700">{c.description}</p> : null}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">Open requests</h2>
        <ul className="mt-3 space-y-2">
          {c.requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/${locale}/requests/${r.slug}`}
                className="font-medium text-slate-900 hover:text-brand-700"
              >
                {r.title}
              </Link>
              <span className="ms-2 text-xs text-slate-500">
                {r.modelFamily ?? ''}
                {r.industry ? ` · ${r.industry}` : ''}
              </span>
            </li>
          ))}
          {c.requests.length === 0 ? <li className="text-sm text-slate-500">No open requests.</li> : null}
        </ul>
      </div>
    </article>
  );
}
