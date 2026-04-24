'use client';

import type { ApplicationForm, AnswerMap, FormField } from '@trainova/shared';

interface DynamicFieldsProps {
  schema: ApplicationForm;
  values: AnswerMap;
  errors: Record<string, string>;
  onChange: (fieldId: string, value: AnswerMap[string]) => void;
  locale: string;
}

export function DynamicFields({ schema, values, errors, onChange, locale }: DynamicFieldsProps) {
  const isArabic = locale === 'ar';
  return (
    <div className="space-y-3" data-testid="dynamic-fields">
      {schema.fields.map((field) => (
        <DynamicField
          key={field.id}
          field={field}
          value={values[field.id]}
          error={errors[field.id]}
          onChange={(v) => onChange(field.id, v)}
          isArabic={isArabic}
        />
      ))}
    </div>
  );
}

interface DynamicFieldProps {
  field: FormField;
  value: AnswerMap[string] | undefined;
  error: string | undefined;
  onChange: (value: AnswerMap[string]) => void;
  isArabic: boolean;
}

function DynamicField({ field, value, error, onChange, isArabic }: DynamicFieldProps) {
  const label = isArabic ? field.labelAr : field.labelEn;
  const help = isArabic ? field.helpAr : field.helpEn;
  const id = `df-${field.id}`;
  const commonProps = {
    id,
    'data-testid': `df-${field.id}`,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const;

  let control: React.ReactNode;
  switch (field.kind) {
    case 'long_text':
      control = (
        <textarea
          {...commonProps}
          className="input min-h-[100px]"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
        />
      );
      break;
    case 'number':
      control = (
        <input
          {...commonProps}
          type="number"
          className="input"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
          min={field.min}
          max={field.max}
        />
      );
      break;
    case 'date':
      control = (
        <input
          {...commonProps}
          type="date"
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'url':
      control = (
        <input
          {...commonProps}
          type="url"
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'email':
      control = (
        <input
          {...commonProps}
          type="email"
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'boolean':
      control = (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            {...commonProps}
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>{label}</span>
        </label>
      );
      break;
    case 'single_select':
      control = (
        <select
          {...commonProps}
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{isArabic ? 'اختر' : 'Select'}</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {isArabic ? opt.labelAr : opt.labelEn}
            </option>
          ))}
        </select>
      );
      break;
    case 'multi_select': {
      const current = Array.isArray(value) ? (value as string[]) : [];
      control = (
        <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`${id}-label`}>
          {(field.options ?? []).map((opt) => {
            const active = current.includes(opt.value);
            return (
              <button
                type="button"
                key={opt.value}
                onClick={() => {
                  const next = active
                    ? current.filter((v) => v !== opt.value)
                    : [...current, opt.value];
                  onChange(next);
                }}
                className={`rounded-full border px-3 py-1 text-xs transition ${
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300'
                }`}
                data-testid={`df-${field.id}-option-${opt.value}`}
              >
                {isArabic ? opt.labelAr : opt.labelEn}
              </button>
            );
          })}
        </div>
      );
      break;
    }
    case 'short_text':
    default:
      control = (
        <input
          {...commonProps}
          type="text"
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.maxLength}
        />
      );
  }

  return (
    <div>
      {field.kind !== 'boolean' ? (
        <label className="label" htmlFor={id} id={`${id}-label`}>
          {label}
          {field.required ? <span className="ml-1 text-red-500">*</span> : null}
        </label>
      ) : null}
      {control}
      {help ? <p className="mt-1 text-xs text-slate-500">{help}</p> : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-red-600" data-testid={`df-${field.id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
