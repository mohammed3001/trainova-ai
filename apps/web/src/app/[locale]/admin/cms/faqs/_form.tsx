import { getTranslations } from 'next-intl/server';
import { saveFaqAction } from '@/lib/cms-actions';

interface Initial {
  id: string;
  locale: string;
  section: string;
  question: string;
  answer: string;
  order: number;
  published: boolean;
}

const LOCALES = ['en', 'ar'] as const;
const SECTIONS = [
  'GENERAL',
  'COMPANIES',
  'TRAINERS',
  'PAYMENTS',
  'TESTS',
  'MODELS',
  'ACCOUNT',
] as const;

export async function FaqForm({ initial }: { initial?: Initial }) {
  const t = await getTranslations();
  return (
    <form
      action={saveFaqAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Field label={t('admin.cms.faqs.field.locale')} required>
          <select
            name="locale"
            defaultValue={initial?.locale ?? 'en'}
            className={inputClass}
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l.toUpperCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.faqs.field.section')} required>
          <select
            name="section"
            defaultValue={initial?.section ?? 'GENERAL'}
            className={inputClass}
          >
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`admin.cms.faqs.section.${s}` as 'admin.cms.faqs.section.GENERAL')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.faqs.field.order')}>
          <input
            name="order"
            type="number"
            min={0}
            max={10000}
            defaultValue={initial?.order ?? 0}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('admin.cms.faqs.field.question')} required>
        <input
          name="question"
          required
          defaultValue={initial?.question ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label={t('admin.cms.faqs.field.answer')} required>
        <textarea
          name="answer"
          required
          rows={8}
          defaultValue={initial?.answer ?? ''}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="published"
          defaultChecked={initial?.published ?? true}
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
        />
        {t('admin.cms.faqs.field.published')}
      </label>

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
