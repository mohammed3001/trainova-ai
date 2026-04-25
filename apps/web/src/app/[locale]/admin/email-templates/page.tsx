import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getRole, getToken } from '@/lib/session';
import { authedFetch } from '@/lib/authed-fetch';
import { ADMIN_ROLE_GROUPS, type EmailTemplateKey, type EmailTemplateSpec } from '@trainova/shared';

interface Row {
  id: string;
  key: EmailTemplateKey;
  locale: 'en' | 'ar';
  subject: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
  updatedBy: { id: string; name: string; email: string } | null;
}

interface SpecsResponse {
  specs: EmailTemplateSpec[];
}

interface PageProps {
  searchParams: Promise<{
    key?: string;
    locale?: string;
    enabled?: string;
    q?: string;
  }>;
}

export default async function AdminEmailTemplatesPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const t = await getTranslations();
  const locale = await getLocale();
  const [token, role] = await Promise.all([getToken(), getRole()]);
  if (!token) redirect(`/${locale}/login`);
  if (!(ADMIN_ROLE_GROUPS.CONTENT as readonly string[]).includes(role ?? '')) {
    redirect(`/${locale}`);
  }

  const qs = new URLSearchParams();
  if (sp.key) qs.set('key', sp.key);
  if (sp.locale) qs.set('locale', sp.locale);
  if (sp.enabled) qs.set('enabled', sp.enabled);
  if (sp.q) qs.set('q', sp.q);

  const [rows, specs] = await Promise.all([
    authedFetch<Row[]>(`/admin/email-templates${qs.toString() ? `?${qs}` : ''}`),
    authedFetch<SpecsResponse>('/admin/email-templates/specs'),
  ]);

  const covered = new Set(rows.map((r) => `${r.key}:${r.locale}`));
  const missing: Array<{ key: EmailTemplateKey; locale: 'en' | 'ar' }> = [];
  for (const spec of specs.specs) {
    for (const loc of ['en', 'ar'] as const) {
      if (!covered.has(`${spec.key}:${loc}`)) missing.push({ key: spec.key, locale: loc });
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('admin.emailTemplates.title')}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('admin.emailTemplates.subtitle')}
          </p>
        </div>
        <Link className="btn-primary" href={`/${locale}/admin/email-templates/new`}>
          {t('admin.emailTemplates.new')}
        </Link>
      </header>

      <form
        className="card flex flex-wrap items-end gap-3 bg-white/70 backdrop-blur"
        action=""
        method="get"
      >
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailTemplates.filter.key')}
          <select name="key" defaultValue={sp.key ?? ''} className="input min-w-[200px]">
            <option value="">{t('admin.emailTemplates.filter.all')}</option>
            {specs.specs.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailTemplates.filter.locale')}
          <select name="locale" defaultValue={sp.locale ?? ''} className="input min-w-[120px]">
            <option value="">{t('admin.emailTemplates.filter.all')}</option>
            <option value="en">EN</option>
            <option value="ar">AR</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailTemplates.filter.enabled')}
          <select name="enabled" defaultValue={sp.enabled ?? ''} className="input min-w-[140px]">
            <option value="">{t('admin.emailTemplates.filter.all')}</option>
            <option value="true">{t('admin.emailTemplates.enabled')}</option>
            <option value="false">{t('admin.emailTemplates.disabled')}</option>
          </select>
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
          {t('admin.emailTemplates.filter.search')}
          <input
            name="q"
            defaultValue={sp.q ?? ''}
            placeholder={t('admin.emailTemplates.filter.searchPlaceholder')}
            className="input"
          />
        </label>
        <button type="submit" className="btn-primary">
          {t('admin.emailTemplates.filter.apply')}
        </button>
      </form>

      {missing.length > 0 && (
        <section className="card border-amber-200 bg-amber-50/80">
          <h2 className="text-sm font-semibold text-amber-900">
            {t('admin.emailTemplates.missing.title')}
          </h2>
          <p className="mt-1 text-xs text-amber-800">
            {t('admin.emailTemplates.missing.subtitle')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {missing.map((m) => (
              <li key={`${m.key}:${m.locale}`}>
                <Link
                  href={`/${locale}/admin/email-templates/new?key=${m.key}&locale=${m.locale}`}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                >
                  {m.key} · {m.locale.toUpperCase()}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-x-auto rounded-xl bg-white/60 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-slate-50/50 text-start text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 text-start">{t('admin.emailTemplates.col.key')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailTemplates.col.locale')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailTemplates.col.subject')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailTemplates.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('admin.emailTemplates.col.updated')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                  {t('admin.emailTemplates.empty')}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-xs">
                  <Link
                    href={`/${locale}/admin/email-templates/${r.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {r.key}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs uppercase">{r.locale}</td>
                <td className="px-4 py-3 text-sm" dir={r.locale === 'ar' ? 'rtl' : 'ltr'}>
                  {r.subject}
                </td>
                <td className="px-4 py-3 text-xs">
                  {r.enabled ? (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                      {t('admin.emailTemplates.enabled')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">
                      {t('admin.emailTemplates.disabled')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {new Date(r.updatedAt).toLocaleString(locale)}
                  {r.updatedBy && (
                    <div className="text-[11px] text-slate-400">
                      {t('admin.emailTemplates.by', { name: r.updatedBy.name })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
