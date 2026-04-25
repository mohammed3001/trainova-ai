import { getTranslations } from 'next-intl/server';
import { locales as LOCALES } from '@/i18n/config';
import { savePageAction } from '@/lib/cms-actions';

interface Initial {
  id: string;
  slug: string;
  locale: string;
  title: string;
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
  kind: string;
}

const STATUSES = ['DRAFT', 'PUBLISHED'] as const;
const KINDS = ['PAGE', 'LEGAL'] as const;

export async function PageForm({ initial }: { initial?: Initial }) {
  const t = await getTranslations();
  return (
    <form
      action={savePageAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('admin.cms.pages.field.title')} required>
          <input
            name="title"
            required
            defaultValue={initial?.title ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('admin.cms.pages.field.slug')} required>
          <input
            name="slug"
            required
            defaultValue={initial?.slug ?? ''}
            className={`${inputClass} font-mono`}
            placeholder="about-us"
          />
        </Field>
        <Field label={t('admin.cms.pages.field.locale')} required>
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
        <Field label={t('admin.cms.pages.field.kind')} required>
          <select name="kind" defaultValue={initial?.kind ?? 'PAGE'} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.cms.pageKind.${k}` as 'admin.cms.pageKind.PAGE')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.pages.field.status')} required>
          <select
            name="status"
            defaultValue={initial?.status ?? 'DRAFT'}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.cms.pageStatus.${s}` as 'admin.cms.pageStatus.DRAFT')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.pages.field.metaTitle')}>
          <input
            name="metaTitle"
            defaultValue={initial?.metaTitle ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('admin.cms.pages.field.metaDescription')}>
        <textarea
          name="metaDescription"
          rows={2}
          defaultValue={initial?.metaDescription ?? ''}
          className={inputClass}
        />
      </Field>

      <Field label={t('admin.cms.pages.field.content')} required>
        <textarea
          name="content"
          required
          rows={16}
          defaultValue={initial?.content ?? ''}
          className={`${inputClass} font-mono text-xs`}
          placeholder={t('admin.cms.pages.field.contentHint')}
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
