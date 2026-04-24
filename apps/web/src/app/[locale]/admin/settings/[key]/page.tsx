import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { apiFetch } from '@/lib/api';
import { getToken } from '@/lib/session';
import { isKnownSetting, SETTING_REGISTRY, type AdminSetting } from '@trainova/shared';
import { SettingForm } from '../_form';

export const dynamic = 'force-dynamic';

async function fetchOne(key: string): Promise<AdminSetting | null> {
  const token = await getToken();
  if (!token) return null;
  try {
    return await apiFetch<AdminSetting>(`/admin/settings/${encodeURIComponent(key)}`, { token });
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

export default async function EditSettingPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const t = await getTranslations();
  const { key: rawKey } = await params;
  const key = decodeURIComponent(rawKey);
  const existing = await fetchOne(key);
  const known = isKnownSetting(key);

  if (!existing && !known) notFound();

  const initial = existing ?? {
    key,
    value: null,
    group: key.includes('.') ? (key.split('.', 1)[0] ?? 'general') : 'general',
    isPublic: known ? SETTING_REGISTRY[key as keyof typeof SETTING_REGISTRY].isPublic : false,
    description: null,
    updatedAt: '',
    updatedBy: null,
  };

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-800">
          {t('admin.settings.editTitle', { key })}
        </h1>
        {known ? (
          <p className="text-sm text-slate-500">{t('admin.settings.knownKeyHint')}</p>
        ) : null}
      </header>
      <SettingForm
        initial={{
          key: initial.key,
          value: initial.value,
          group: initial.group,
          isPublic: initial.isPublic,
          description: initial.description,
        }}
      />
    </div>
  );
}
