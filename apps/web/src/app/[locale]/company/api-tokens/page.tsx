import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/authed-fetch';
import { getRole, getToken } from '@/lib/session';
import { ApiTokensClient } from './api-tokens-client';
import type { ApiTokenDto } from '@trainova/shared';

interface Props {
  params: Promise<{ locale: string }>;
}

/**
 * T9.B — Company-side token-management dashboard. Restricted to
 * `COMPANY_OWNER` (or platform `SUPER_ADMIN` for support); team-side
 * `COMPANY_MEMBER` access lands with T9.A. The page is a thin shell
 * around `ApiTokensClient`, which owns the create / revoke flow.
 */
export default async function CompanyApiTokensPage({ params }: Props) {
  const { locale } = await params;
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login?redirect=/${locale}/company/api-tokens`);
  if (role !== 'COMPANY_OWNER' && role !== 'SUPER_ADMIN') {
    redirect(`/${locale}/dashboard`);
  }

  const items = await authedFetch<{ items: ApiTokenDto[] }>('/company/api-tokens')
    .then((r) => r.items)
    .catch(() => [] as ApiTokenDto[]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">API tokens</h1>
        <p className="mt-1 text-sm text-slate-500">
          Programmatic access to your company&rsquo;s data via the public{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/v1</code> API.
          Tokens are shown once at creation &mdash; copy and store them in your secret manager.
        </p>
      </header>
      <ApiTokensClient initial={items} />
    </div>
  );
}
