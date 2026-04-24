'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { EmailTemplateKey, EmailTemplateSpec } from '@trainova/shared';
import { createEmailTemplateAction } from '../actions';

interface Props {
  specs: EmailTemplateSpec[];
  initialKey?: EmailTemplateKey;
  initialLocale: 'en' | 'ar';
}

const DEFAULT_HTML = `<p>Hi {{name}},</p>\n<p>Write your message here.</p>`;
const DEFAULT_TEXT = `Hi {{name}},\n\nWrite your message here.`;

export function NewTemplateForm({ specs, initialKey, initialLocale }: Props) {
  const t = useTranslations('admin.emailTemplates');
  const [key, setKey] = useState<EmailTemplateKey | ''>(initialKey ?? '');
  const [loc, setLoc] = useState<'en' | 'ar'>(initialLocale);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML);
  const [bodyText, setBodyText] = useState(DEFAULT_TEXT);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const spec = useMemo(() => specs.find((s) => s.key === key) ?? null, [specs, key]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await createEmailTemplateAction(fd);
      if (!result.ok) {
        setError(result.error ?? t('createFailed'));
      }
    });
  }

  const dir = loc === 'ar' ? 'rtl' : 'ltr';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className="card space-y-4 bg-white/70 backdrop-blur">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">{t('editor.key')}</span>
                <select
                  name="key"
                  value={key}
                  onChange={(e) => setKey(e.target.value as EmailTemplateKey)}
                  className="input"
                  required
                >
                  <option value="" disabled>
                    {t('editor.selectKey')}
                  </option>
                  {specs.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">{t('editor.locale')}</span>
                <select
                  name="locale"
                  value={loc}
                  onChange={(e) => setLoc(e.target.value as 'en' | 'ar')}
                  className="input"
                  required
                >
                  <option value="en">EN</option>
                  <option value="ar">AR</option>
                </select>
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="enabled"
                defaultChecked
                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              {t('enabled')}
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.description')}</span>
              <textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="input resize-y"
                placeholder={spec?.description}
              />
            </label>
          </div>

          <div className="card space-y-4 bg-white/70 backdrop-blur">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.subject')}</span>
              <input
                name="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="input"
                dir={dir}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.bodyHtml')}</span>
              <textarea
                name="bodyHtml"
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={12}
                className="input font-mono text-xs"
                dir={dir}
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-slate-700">{t('editor.bodyText')}</span>
              <textarea
                name="bodyText"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={6}
                className="input font-mono text-xs"
                dir={dir}
                required
              />
            </label>
          </div>
        </div>

        <aside className="card bg-gradient-to-br from-brand-50 to-white">
          <div className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {t('editor.variables.title')}
          </div>
          {spec ? (
            <>
              <p className="mt-1 text-xs text-slate-600">{spec.description}</p>
              <ul className="mt-3 space-y-1 text-xs">
                {spec.requiredVariables.map((v) => (
                  <li key={v} className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-700">
                      {'{{'}
                      {v}
                      {'}}'}
                    </span>
                    <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] uppercase text-rose-700">
                      req
                    </span>
                  </li>
                ))}
                {spec.optionalVariables.map((v) => (
                  <li key={v} className="font-mono text-slate-600">
                    {'{{'}
                    {v}
                    {'}}'}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">{t('editor.selectKey')}</p>
          )}
        </aside>
      </div>

      {error && (
        <div className="rounded-md bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? t('editor.creating') : t('editor.create')}
        </button>
      </div>
    </form>
  );
}
