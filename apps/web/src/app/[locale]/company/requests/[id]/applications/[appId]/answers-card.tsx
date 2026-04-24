import { getTranslations } from 'next-intl/server';
import { applicationFormSchema, type ApplicationForm, type FormField } from '@trainova/shared';

interface AnswersCardProps {
  schemaJson: unknown;
  answers: Record<string, unknown>;
  locale: string;
}

export async function AnswersCard({ schemaJson, answers, locale }: AnswersCardProps) {
  const t = await getTranslations('company.applications.answers');

  let schema: ApplicationForm | null = null;
  if (schemaJson) {
    const parsed = applicationFormSchema.safeParse(schemaJson);
    if (parsed.success) schema = parsed.data;
  }

  if (!schema || schema.fields.length === 0) return null;

  return (
    <section className="card space-y-3" data-testid="application-answers">
      <h2 className="text-lg font-semibold text-slate-900">{t('title')}</h2>
      <dl className="space-y-3">
        {schema.fields.map((field) => (
          <div key={field.id} className="border-l-2 border-slate-200 pl-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {locale === 'ar' ? field.labelAr : field.labelEn}
            </dt>
            <dd
              className="mt-1 whitespace-pre-line text-sm text-slate-800"
              data-testid={`answer-${field.id}`}
            >
              {renderAnswer(field, answers[field.id], locale, t('empty'))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function renderAnswer(
  field: FormField,
  value: unknown,
  locale: string,
  emptyLabel: string,
): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className="text-slate-400">{emptyLabel}</span>;
  }

  switch (field.kind) {
    case 'boolean':
      return value ? (locale === 'ar' ? 'نعم' : 'Yes') : locale === 'ar' ? 'لا' : 'No';
    case 'single_select': {
      const opt = (field.options ?? []).find((o) => o.value === value);
      if (!opt) return String(value);
      return locale === 'ar' ? opt.labelAr : opt.labelEn;
    }
    case 'multi_select': {
      if (!Array.isArray(value)) return String(value);
      const labels = value
        .map((v) => {
          const opt = (field.options ?? []).find((o) => o.value === v);
          if (!opt) return String(v);
          return locale === 'ar' ? opt.labelAr : opt.labelEn;
        })
        .join('، ');
      return labels;
    }
    case 'url':
      return (
        <a
          href={String(value)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-brand-700 underline hover:text-brand-800"
        >
          {String(value)}
        </a>
      );
    default:
      return String(value);
  }
}
