'use client';

import { useState } from 'react';

interface Props {
  title: string;
  data: unknown;
  /** Collapsed by default. Admin panel surfaces raw JSON under `<details>`. */
  defaultOpen?: boolean;
}

/**
 * Collapsible raw-JSON panel used across every admin detail page so a
 * non-technical operator can still inspect the underlying row without SQL.
 */
export function JsonAccordion({ title, data, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const json =
    typeof data === 'string' ? data : JSON.stringify(data, jsonReplacer, 2);

  return (
    <section className="rounded-2xl border border-white/60 bg-white/60 p-4 shadow-sm backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-start"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <span
          aria-hidden
          className={`text-sm text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open ? (
        <pre
          dir="ltr"
          className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-100"
        >
          {json}
        </pre>
      ) : null}
    </section>
  );
}

function jsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}
