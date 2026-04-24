import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { authedFetch } from '@/lib/authed-fetch';
import { VerifiedBadge } from '@/components/admin/verified-badge';
import { ActionButton } from '@/components/admin/action-button';
import { setCompanyVerifiedAction } from '@/lib/admin-actions';

interface CompanyDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  country: string | null;
  websiteUrl: string | null;
  size: string | null;
  industry: string | null;
  verified: boolean;
  createdAt: string;
  owner: { id: string; email: string; name: string; role: string; status: string } | null;
  _count: { requests: number };
}

export default async function AdminCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations();
  const locale = await getLocale();

  let company: CompanyDetail;
  try {
    company = await authedFetch<CompanyDetail>(`/admin/companies/${id}`);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href={`/${locale}/admin/companies`} className="hover:text-brand-700">
          ← {t('admin.companies.title')}
        </Link>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-white/60 bg-white/70 p-6 shadow-sm backdrop-blur-md">
        <div className="flex items-start gap-4">
          {company.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logoUrl}
              alt=""
              className="h-16 w-16 rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-500 text-2xl font-bold text-white">
              {company.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{company.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
              <span className="font-mono text-xs">{company.slug}</span>
              {company.country && <span>· {company.country}</span>}
              {company.industry && <span>· {company.industry}</span>}
            </div>
            <div className="mt-2">
              <VerifiedBadge
                verified={company.verified}
                labelVerified={t('admin.common.verified')}
                labelUnverified={t('admin.common.unverified')}
              />
            </div>
          </div>
        </div>
        <form action={setCompanyVerifiedAction}>
          <input type="hidden" name="id" value={company.id} />
          <input type="hidden" name="verified" value={company.verified ? 'false' : 'true'} />
          <ActionButton
            variant={company.verified ? 'ghost' : 'success'}
            confirm={
              company.verified
                ? t('admin.companies.confirm.unverify')
                : t('admin.companies.confirm.verify')
            }
          >
            {company.verified ? t('admin.companies.action.unverify') : t('admin.companies.action.verify')}
          </ActionButton>
        </form>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.companies.section.details')}
          </h2>
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">{t('admin.companies.field.website')}</dt>
            <dd className="text-slate-900">
              {company.websiteUrl ? (
                <a
                  href={company.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  {company.websiteUrl}
                </a>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-slate-500">{t('admin.companies.field.size')}</dt>
            <dd className="text-slate-900">{company.size ?? '—'}</dd>
            <dt className="text-slate-500">{t('admin.companies.field.industry')}</dt>
            <dd className="text-slate-900">{company.industry ?? '—'}</dd>
            <dt className="text-slate-500">{t('admin.companies.field.requests')}</dt>
            <dd className="text-slate-900">{company._count.requests}</dd>
            <dt className="text-slate-500">{t('admin.users.col.created')}</dt>
            <dd className="text-slate-900">{new Date(company.createdAt).toLocaleString()}</dd>
          </dl>
          {company.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {company.description}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('admin.companies.section.owner')}
          </h2>
          {company.owner ? (
            <Link
              href={`/${locale}/admin/users/${company.owner.id}`}
              className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white/60 px-3 py-2 hover:border-brand-300 hover:bg-brand-50/50"
            >
              <div>
                <div className="font-semibold text-slate-900">{company.owner.name}</div>
                <div className="font-mono text-xs text-slate-500">{company.owner.email}</div>
              </div>
              <span className="text-slate-400">→</span>
            </Link>
          ) : (
            <p className="mt-3 text-xs text-slate-500">{t('admin.companies.ownerMissing')}</p>
          )}
        </section>
      </div>
    </div>
  );
}
