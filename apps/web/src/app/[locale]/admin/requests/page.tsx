import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: string;
  company: { name: string; slug: string };
  _count: { applications: number };
}

export default async function AdminRequestsPage() {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const rows = await authedFetch<Row[]>('/admin/requests');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Requests</h1>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="card">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{r.title}</div>
                <div className="text-xs text-slate-500">
                  {r.company.name} · {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="badge">{r.status}</span>
                <span>{r._count.applications} apps</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
