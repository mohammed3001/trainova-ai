import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';

interface Row {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export default async function AdminUsersPage() {
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') redirect(`/${locale}`);

  const users = await authedFetch<Row[]>('/admin/users');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-slate-900">Users</h1>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-start text-xs uppercase text-slate-500">
              <th className="py-2 pe-3 text-start">Name</th>
              <th className="py-2 pe-3 text-start">Email</th>
              <th className="py-2 pe-3 text-start">Role</th>
              <th className="py-2 pe-3 text-start">Status</th>
              <th className="py-2 pe-3 text-start">Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b hover:bg-slate-50">
                <td className="py-2 pe-3">{u.name}</td>
                <td className="py-2 pe-3 font-mono text-xs">{u.email}</td>
                <td className="py-2 pe-3">
                  <span className="badge">{u.role}</span>
                </td>
                <td className="py-2 pe-3">{u.status}</td>
                <td className="py-2 pe-3 text-xs text-slate-500">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
