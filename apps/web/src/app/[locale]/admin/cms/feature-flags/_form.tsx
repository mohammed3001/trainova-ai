import { getTranslations } from 'next-intl/server';
import { saveFeatureFlagAction } from '@/lib/cms-actions';

interface Initial {
  key: string;
  description: string | null;
  enabled: boolean;
  payload: unknown;
}

export async function FeatureFlagForm({ initial }: { initial?: Initial }) {
  const t = await getTranslations();
  const payloadStr =
    initial?.payload != null ? JSON.stringify(initial.payload, null, 2) : '';

  return (
    <form
      action={saveFeatureFlagAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      <Field label={t('admin.cms.featureFlags.field.key')} required>
        <input
          name="key"
          required
          defaultValue={initial?.key ?? ''}
          readOnly={!!initial?.key}
          pattern="[a-z0-9]+([._-][a-z0-9]+)*"
          className={`${inputClass} font-mono ${
            initial?.key ? 'bg-slate-50 text-slate-500' : ''
          }`}
          placeholder="ads.banner_enabled"
        />
      </Field>

      <Field label={t('admin.cms.featureFlags.field.description')}>
        <textarea
          name="description"
          rows={2}
          defaultValue={initial?.description ?? ''}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={initial?.enabled ?? false}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        {t('admin.cms.featureFlags.field.enabled')}
      </label>

      <Field label={t('admin.cms.featureFlags.field.payload')}>
        <textarea
          name="payload"
          rows={8}
          defaultValue={payloadStr}
          className={`${inputClass} font-mono text-xs`}
          placeholder='{ "variant": "A", "rollout": 0.5 }'
        />
        <span className="text-xs text-slate-500">
          {t('admin.cms.featureFlags.field.payloadHint')}
        </span>
      </Field>

      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.cms.save')}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-200';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}
