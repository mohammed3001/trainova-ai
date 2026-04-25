'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { AiAssistKind } from '@trainova/shared';
import { runAiAssistAction } from './actions';

type Locale = 'en' | 'ar' | 'fr' | 'es';

interface TabDef {
  kind: AiAssistKind;
  iconKey: string;
}

const TABS: TabDef[] = [
  { kind: 'REQUEST_DRAFT', iconKey: '✦' },
  { kind: 'APPLICATION_SCREEN', iconKey: '◈' },
  { kind: 'CHAT_SUMMARY', iconKey: '✎' },
  { kind: 'CHAT_TASKS', iconKey: '☑' },
  { kind: 'SEO_META', iconKey: '⌖' },
  { kind: 'EMAIL_DRAFT', iconKey: '✉' },
  { kind: 'PRICING_SUGGEST', iconKey: '＄' },
  { kind: 'TEST_GEN', iconKey: '⌘' },
  { kind: 'PROFILE_OPT', iconKey: '☆' },
];

interface Props {
  locale: Locale;
}

interface ResultState {
  ok: boolean;
  id?: string;
  output?: unknown;
  error?: string;
}

export function AiAssistClient({ locale }: Props) {
  const t = useTranslations('ai.assist');
  const [active, setActive] = useState<AiAssistKind>('REQUEST_DRAFT');
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ResultState | null>(null);

  function submit(input: Record<string, unknown>) {
    setResult(null);
    startTransition(async () => {
      const res = await runAiAssistAction(active, input);
      if (res.ok) setResult({ ok: true, id: res.id, output: res.output });
      else setResult({ ok: false, error: res.error });
    });
  }

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-white/60 bg-gradient-to-br from-brand-500/10 via-fuchsia-400/10 to-cyan-400/10 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{t('title')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('subtitle')}</p>
          </div>
          <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
            {t('badge')}
          </span>
        </div>
      </header>

      <nav
        aria-label={t('tabsLabel')}
        className="flex flex-wrap gap-2"
        role="tablist"
      >
        {TABS.map((tab) => {
          const selected = tab.kind === active;
          return (
            <button
              key={tab.kind}
              role="tab"
              aria-selected={selected}
              aria-controls={`ai-panel-${tab.kind}`}
              id={`ai-tab-${tab.kind}`}
              type="button"
              onClick={() => {
                setActive(tab.kind);
                setResult(null);
              }}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                selected
                  ? 'border-brand-400 bg-brand-500 text-white shadow-md'
                  : 'border-white/70 bg-white/60 text-slate-700 hover:border-brand-300 hover:text-brand-700'
              }`}
            >
              <span className="me-2" aria-hidden>
                {tab.iconKey}
              </span>
              {t(`kinds.${tab.kind}.tab`)}
            </button>
          );
        })}
      </nav>

      <section
        role="tabpanel"
        id={`ai-panel-${active}`}
        aria-labelledby={`ai-tab-${active}`}
        className="grid gap-4 lg:grid-cols-2"
      >
        <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            {t(`kinds.${active}.heading`)}
          </h2>
          <p className="mb-4 text-xs text-slate-600">
            {t(`kinds.${active}.help`)}
          </p>
          <KindForm kind={active} locale={locale} disabled={isPending} onSubmit={submit} />
        </div>

        <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-md">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">{t('resultTitle')}</h2>
          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-brand-500" />
              {t('running')}
            </div>
          ) : result ? (
            result.ok ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-500">
                  {t('savedAs')}: <code className="rounded bg-slate-100 px-1.5 py-0.5">{result.id}</code>
                </div>
                <pre className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                  {JSON.stringify(result.output, null, 2)}
                </pre>
              </div>
            ) : (
              <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
                {result.error}
              </div>
            )
          ) : (
            <p className="text-sm text-slate-500">{t('emptyResult')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

interface KindFormProps {
  kind: AiAssistKind;
  locale: Locale;
  disabled: boolean;
  onSubmit: (input: Record<string, unknown>) => void;
}

function KindForm({ kind, locale, disabled, onSubmit }: KindFormProps) {
  const t = useTranslations('ai.assist');

  function handler(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: Record<string, unknown> = {};
    fd.forEach((value, key) => {
      if (value === '') return;
      if (key.endsWith('__num')) {
        const realKey = key.slice(0, -5);
        input[realKey] = Number(value);
      } else {
        input[key] = value;
      }
    });
    onSubmit(input);
  }

  return (
    <form onSubmit={handler} className="space-y-3">
      {renderFields(kind, locale, t)}
      <button
        type="submit"
        disabled={disabled}
        className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {disabled ? t('running') : t('runButton')}
      </button>
    </form>
  );
}

type T = ReturnType<typeof useTranslations<'ai.assist'>>;

function fieldLabel(t: T, kind: AiAssistKind, name: string) {
  return t(`kinds.${kind}.fields.${name}`);
}

function localeOptions() {
  return ['en', 'ar', 'fr', 'es'];
}

function renderFields(kind: AiAssistKind, locale: Locale, t: T) {
  switch (kind) {
    case 'REQUEST_DRAFT':
      return (
        <>
          <Field label={fieldLabel(t, kind, 'brief')}>
            <textarea
              name="brief"
              required
              minLength={20}
              maxLength={4000}
              rows={6}
              className="input"
              placeholder={t(`kinds.${kind}.placeholders.brief`)}
            />
          </Field>
          <Field label={fieldLabel(t, kind, 'industry')}>
            <input name="industry" maxLength={80} className="input" />
          </Field>
          <LocaleField defaultLocale={locale} t={t} kind={kind} />
        </>
      );
    case 'APPLICATION_SCREEN':
      return (
        <Field label={fieldLabel(t, kind, 'applicationId')}>
          <input name="applicationId" required className="input" />
        </Field>
      );
    case 'CHAT_SUMMARY':
    case 'CHAT_TASKS':
      return (
        <>
          <Field label={fieldLabel(t, kind, 'conversationId')}>
            <input name="conversationId" required className="input" />
          </Field>
          <Field label={fieldLabel(t, kind, 'maxMessages')}>
            <input
              name="maxMessages__num"
              type="number"
              min={5}
              max={200}
              defaultValue={80}
              className="input"
            />
          </Field>
        </>
      );
    case 'SEO_META':
      return (
        <>
          <Field label={fieldLabel(t, kind, 'resource')}>
            <select name="resource" required className="input">
              {['Page', 'Article', 'JobRequest', 'TrainerProfile', 'Skill', 'Company'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label={fieldLabel(t, kind, 'topic')}>
            <input name="topic" required minLength={3} maxLength={200} className="input" />
          </Field>
          <Field label={fieldLabel(t, kind, 'body')}>
            <textarea name="body" required minLength={10} maxLength={20000} rows={6} className="input" />
          </Field>
          <LocaleField defaultLocale={locale} t={t} kind={kind} />
        </>
      );
    case 'EMAIL_DRAFT':
      return (
        <>
          <Field label={fieldLabel(t, kind, 'audience')}>
            <select name="audience" required className="input">
              {['TRAINER', 'COMPANY', 'CUSTOM'].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field label={fieldLabel(t, kind, 'intent')}>
            <textarea name="intent" required minLength={10} maxLength={500} rows={4} className="input" />
          </Field>
          <Field label={fieldLabel(t, kind, 'tone')}>
            <input name="tone" maxLength={80} className="input" />
          </Field>
          <LocaleField defaultLocale={locale} t={t} kind={kind} />
        </>
      );
    case 'PRICING_SUGGEST':
      return (
        <Field label={fieldLabel(t, kind, 'jobRequestId')}>
          <input name="jobRequestId" required className="input" />
        </Field>
      );
    case 'TEST_GEN':
      return (
        <>
          <Field label={fieldLabel(t, kind, 'jobRequestId')}>
            <input name="jobRequestId" required className="input" />
          </Field>
          <Field label={fieldLabel(t, kind, 'taskCount')}>
            <input
              name="taskCount__num"
              type="number"
              min={1}
              max={8}
              defaultValue={3}
              className="input"
            />
          </Field>
        </>
      );
    case 'PROFILE_OPT':
      return (
        <Field label={fieldLabel(t, kind, 'trainerProfileId')}>
          <input name="trainerProfileId" required className="input" />
        </Field>
      );
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
      {label}
      {children}
    </label>
  );
}

function LocaleField({ defaultLocale, t, kind }: { defaultLocale: Locale; t: T; kind: AiAssistKind }) {
  return (
    <Field label={fieldLabel(t, kind, 'locale')}>
      <select name="locale" defaultValue={defaultLocale} className="input">
        {localeOptions().map((l) => (
          <option key={l} value={l}>
            {l.toUpperCase()}
          </option>
        ))}
      </select>
    </Field>
  );
}
