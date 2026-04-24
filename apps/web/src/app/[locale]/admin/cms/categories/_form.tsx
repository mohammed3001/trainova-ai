import { getTranslations } from 'next-intl/server';
import { saveCategoryAction } from '@/lib/cms-actions';

interface Initial {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  descriptionAr: string | null;
  order: number;
}

export async function CategoryForm({ initial }: { initial?: Initial }) {
  const t = await getTranslations();
  return (
    <form
      action={saveCategoryAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('admin.cms.categories.field.slug')} required>
          <input
            name="slug"
            required
            defaultValue={initial?.slug ?? ''}
            className={`${inputClass} font-mono`}
            placeholder="fine-tuning"
          />
        </Field>
        <Field label={t('admin.cms.categories.field.order')}>
          <input
            name="order"
            type="number"
            min={0}
            max={10000}
            defaultValue={initial?.order ?? 0}
            className={inputClass}
          />
        </Field>
        <Field label={t('admin.cms.categories.field.nameEn')} required>
          <input
            name="nameEn"
            required
            defaultValue={initial?.nameEn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('admin.cms.categories.field.nameAr')} required>
          <input
            name="nameAr"
            required
            dir="rtl"
            defaultValue={initial?.nameAr ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('admin.cms.categories.field.descriptionEn')}>
        <textarea
          name="descriptionEn"
          rows={3}
          defaultValue={initial?.descriptionEn ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label={t('admin.cms.categories.field.descriptionAr')}>
        <textarea
          name="descriptionAr"
          rows={3}
          dir="rtl"
          defaultValue={initial?.descriptionAr ?? ''}
          className={inputClass}
        />
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
