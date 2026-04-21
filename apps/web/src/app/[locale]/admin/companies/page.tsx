import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  verified: boolean;
  createdAt: string;
}

export default async function AdminCompaniesPage() {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const rows = await authedFetch<Row[]>('/admin/companies');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Companies</h1>
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="card flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900">{c.name}</div>
              <div className="text-xs text-slate-500">
                {c.slug}
                {c.country ? ` · ${c.country}` : ''}
              </div>
            </div>
            {c.verified ? <span className="badge-accent">Verified</span> : <span className="badge">Pending</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
