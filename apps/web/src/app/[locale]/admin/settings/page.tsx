import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { requireAdminGroup } from '@/lib/admin-guard';
import { getToken } from '@/lib/session';
import { SETTING_GROUPS, SETTING_REGISTRY, type AdminSetting } from '@trainova/shared';

export const dynamic = 'force-dynamic';

async function fetchSettings(): Promise<AdminSetting[]> {
  const token = await getToken();
  if (!token) return [];
  try {
    return await apiFetch<AdminSetting[]>('/admin/settings', { token });
  } catch {
    return [];
  }
}

export default async function AdminSettingsPage() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  await requireAdminGroup('SUPER_ONLY', `/${locale}/admin/settings`);
  const settings = await fetchSettings();

  const byKey = new Map(settings.map((s) => [s.key, s]));
  const knownKeys = Object.keys(SETTING_REGISTRY);
  const groupedKnown = new Map<string, string[]>();
  for (const key of knownKeys) {
    const prefix = (key.split('.', 1)[0] ?? 'general') as string;
    const arr = groupedKnown.get(prefix) ?? [];
    arr.push(key);
    groupedKnown.set(prefix, arr);
  }
  const customRows = settings.filter((s) => !knownKeys.includes(s.key));

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{t('admin.settings.title')}</h1>
          <p className="text-sm text-slate-500">{t('admin.settings.subtitle')}</p>
        </div>
        <Link
          href={`/${locale}/admin/settings/new`}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.settings.newCustomKey')}
        </Link>
      </header>

      {SETTING_GROUPS.filter((g) => g !== 'general').map((group) => {
        const keys = groupedKnown.get(group) ?? [];
        if (!keys.length) return null;
        return (
          <section
            key={group}
            className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
          >
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {t(`admin.settings.group.${group}` as 'admin.settings.group.branding')}
            </h2>
            <ul className="divide-y divide-slate-100">
              {keys.map((key) => {
                const row = byKey.get(key);
                const def = SETTING_REGISTRY[key as keyof typeof SETTING_REGISTRY];
                return (
                  <li key={key} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <code className="block truncate font-mono text-xs text-slate-700">{key}</code>
                      <div className="text-xs text-slate-500">
                        {row ? (
                          <span className="truncate">{summarize(row.value)}</span>
                        ) : (
                          <span className="italic text-slate-400">
                            {t('admin.settings.notSet')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          def.isPublic
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {def.isPublic ? t('admin.settings.public') : t('admin.settings.private')}
                      </span>
                      <Link
                        href={`/${locale}/admin/settings/${encodeURIComponent(key)}`}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                      >
                        {t('admin.settings.edit')}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {customRows.length > 0 ? (
        <section className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.settings.group.custom')}
          </h2>
          <ul className="divide-y divide-slate-100">
            {customRows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <code className="block truncate font-mono text-xs text-slate-700">{row.key}</code>
                  <div className="truncate text-xs text-slate-500">{summarize(row.value)}</div>
                </div>
                <Link
                  href={`/${locale}/admin/settings/${encodeURIComponent(row.key)}`}
                  className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                >
                  {t('admin.settings.edit')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function summarize(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.length > 60 ? `${value.slice(0, 60)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 60 ? `${s.slice(0, 60)}…` : s;
  } catch {
    return String(value);
  }
}
