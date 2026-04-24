import { getTranslations } from 'next-intl/server';
import { saveArticleAction } from '@/lib/cms-actions';

interface CategoryOption {
  id: string;
  nameEn: string;
  nameAr: string;
}

interface Initial {
  id: string;
  slug: string;
  locale: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverUrl: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
  categoryId: string | null;
}

const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
const LOCALES = ['en', 'ar'] as const;

export async function ArticleForm({
  initial,
  categories,
}: {
  initial?: Initial;
  categories: CategoryOption[];
}) {
  const t = await getTranslations();
  return (
    <form
      action={saveArticleAction}
      className="space-y-4 rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md"
    >
      {initial?.id ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('admin.cms.articles.field.title')} required>
          <input
            name="title"
            required
            defaultValue={initial?.title ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('admin.cms.articles.field.slug')} required>
          <input
            name="slug"
            required
            defaultValue={initial?.slug ?? ''}
            className={`${inputClass} font-mono`}
            placeholder="launch-post"
          />
        </Field>
        <Field label={t('admin.cms.articles.field.locale')} required>
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
        <Field label={t('admin.cms.articles.field.status')} required>
          <select
            name="status"
            defaultValue={initial?.status ?? 'DRAFT'}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.cms.articleStatus.${s}` as 'admin.cms.articleStatus.DRAFT')}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.articles.field.category')}>
          <select
            name="categoryId"
            defaultValue={initial?.categoryId ?? ''}
            className={inputClass}
          >
            <option value="">{t('admin.cms.articles.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameEn} · {c.nameAr}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('admin.cms.articles.field.coverUrl')}>
          <input
            name="coverUrl"
            type="url"
            defaultValue={initial?.coverUrl ?? ''}
            className={inputClass}
            placeholder="https://..."
          />
        </Field>
      </div>

      <Field label={t('admin.cms.articles.field.excerpt')}>
        <textarea
          name="excerpt"
          rows={2}
          defaultValue={initial?.excerpt ?? ''}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('admin.cms.articles.field.metaTitle')}>
          <input
            name="metaTitle"
            defaultValue={initial?.metaTitle ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('admin.cms.articles.field.metaDescription')}>
          <input
            name="metaDescription"
            defaultValue={initial?.metaDescription ?? ''}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label={t('admin.cms.articles.field.content')} required>
        <textarea
          name="content"
          required
          rows={18}
          defaultValue={initial?.content ?? ''}
          className={`${inputClass} font-mono text-xs`}
          placeholder={t('admin.cms.articles.field.contentHint')}
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
