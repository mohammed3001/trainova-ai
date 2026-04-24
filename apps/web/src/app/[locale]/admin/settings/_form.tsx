import { getTranslations } from 'next-intl/server';
import { SETTING_REGISTRY, isKnownSetting } from '@trainova/shared';
import { saveSettingAction, deleteSettingAction } from '@/lib/settings-actions';

interface InitialSetting {
  key: string;
  value: unknown;
  group: string;
  isPublic: boolean;
  description: string | null;
}

type ValueType = 'string' | 'number' | 'boolean' | 'json';

function inferValueType(key: string, current: unknown): ValueType {
  if (isKnownSetting(key)) {
    const schema = SETTING_REGISTRY[key].schema;
    const t = (schema as unknown as { _def?: { typeName?: string } })._def?.typeName;
    if (t === 'ZodNumber') return 'number';
    if (t === 'ZodBoolean') return 'boolean';
    if (t === 'ZodArray' || t === 'ZodObject' || t === 'ZodEnum' || t === 'ZodRecord') {
      return t === 'ZodEnum' ? 'string' : 'json';
    }
    return 'string';
  }
  if (typeof current === 'number') return 'number';
  if (typeof current === 'boolean') return 'boolean';
  if (current && typeof current === 'object') return 'json';
  return 'string';
}

function serialize(value: unknown, type: ValueType): string {
  if (value == null) return '';
  if (type === 'json') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  if (type === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export async function SettingForm({
  initial,
  prefilledKey,
}: {
  initial?: InitialSetting;
  prefilledKey?: string;
}) {
  const t = await getTranslations();
  const key = initial?.key ?? prefilledKey ?? '';
  const known = key ? isKnownSetting(key) : false;
  const def = known ? SETTING_REGISTRY[key as keyof typeof SETTING_REGISTRY] : null;

  const valueType = inferValueType(key, initial?.value);
  const valueStr = serialize(initial?.value, valueType);
  const isPublic = initial?.isPublic ?? def?.isPublic ?? false;
  const group = initial?.group ?? (key && key.includes('.') ? key.split('.', 1)[0] : 'general');

  return (
    <form
      action={saveSettingAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      <Field label={t('admin.settings.field.key')} required>
        <input
          name="key"
          required
          defaultValue={key}
          readOnly={!!initial?.key}
          pattern="[a-z0-9]+(\.[a-z0-9_-]+)*"
          className={`${inputClass} font-mono ${initial?.key ? 'bg-slate-50 text-slate-500' : ''}`}
          placeholder="branding.siteName"
        />
        {known ? (
          <span className="text-xs text-emerald-700">
            {t('admin.settings.field.knownKey')}
          </span>
        ) : key ? (
          <span className="text-xs text-amber-700">
            {t('admin.settings.field.customKey')}
          </span>
        ) : null}
      </Field>

      <input type="hidden" name="valueType" value={valueType} />

      {valueType === 'boolean' ? (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="value"
            defaultChecked={initial?.value === true}
            value="true"
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
          />
          {t('admin.settings.field.value')}
        </label>
      ) : valueType === 'number' ? (
        <Field label={t('admin.settings.field.value')} required>
          <input
            type="number"
            name="value"
            required
            defaultValue={valueStr}
            className={inputClass}
            step="any"
          />
        </Field>
      ) : valueType === 'json' ? (
        <Field label={t('admin.settings.field.value')} required>
          <textarea
            name="value"
            rows={8}
            defaultValue={valueStr}
            className={`${inputClass} font-mono text-xs`}
            placeholder='["en","ar"]'
          />
          <span className="text-xs text-slate-500">
            {t('admin.settings.field.valueJsonHint')}
          </span>
        </Field>
      ) : (
        <Field label={t('admin.settings.field.value')} required>
          <input name="value" required defaultValue={valueStr} className={inputClass} />
        </Field>
      )}

      <Field label={t('admin.settings.field.group')}>
        <input
          name="group"
          defaultValue={group}
          className={inputClass}
          readOnly={known}
        />
      </Field>

      <Field label={t('admin.settings.field.description')}>
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
          name="isPublic"
          value="true"
          defaultChecked={isPublic}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        {t('admin.settings.field.isPublic')}
      </label>

      <div className="flex items-center justify-between gap-3">
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          {t('admin.settings.save')}
        </button>
        {initial?.key ? <DeleteSettingButton settingKey={initial.key} /> : null}
      </div>
    </form>
  );
}

function DeleteSettingButton({ settingKey }: { settingKey: string }) {
  return (
    <form action={deleteSettingAction}>
      <input type="hidden" name="key" value={settingKey} />
      <button
        type="submit"
        className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
      >
        {/* not translated to keep delete obvious; see admin.settings.delete in messages */}
        Delete
      </button>
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
