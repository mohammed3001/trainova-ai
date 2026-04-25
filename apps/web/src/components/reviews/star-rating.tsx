'use client';

import { useId, useState } from 'react';

interface Props {
  value: number;
  onChange?: (next: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  ariaLabelTemplate?: (value: number) => string;
  testId?: string;
}

const sizeMap: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-7 w-7',
};

/**
 * Accessible star-rating control. In read-only mode it renders as a
 * radiogroup-equivalent labelled list of filled / empty stars; in editable
 * mode the stars are buttons so screen-readers announce them as actionable.
 */
export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 'md',
  ariaLabel,
  ariaLabelTemplate,
  testId,
}: Props) {
  const groupId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const display = readOnly ? value : (hover ?? value);
  const cls = sizeMap[size];
  const label = ariaLabel ?? ariaLabelTemplate?.(value) ?? `${value} of 5`;

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={label}
        data-testid={testId}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} filled={i <= value} className={cls} />
        ))}
      </span>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${groupId}-label`}
      className="inline-flex items-center gap-1"
      data-testid={testId}
    >
      <span id={`${groupId}-label`} className="sr-only">
        {label}
      </span>
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={ariaLabelTemplate?.(i) ?? `${i} of 5`}
          className="rounded p-0.5 transition hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          onClick={() => onChange?.(i)}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
        >
          <Star filled={i <= display} className={cls} />
        </button>
      ))}
    </div>
  );
}

function Star({ filled, className }: { filled: boolean; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`${className} ${filled ? 'fill-amber-400 stroke-amber-500' : 'fill-transparent stroke-slate-300 dark:stroke-slate-600'} transition-colors`}
      strokeWidth="1.5"
    >
      <path
        strokeLinejoin="round"
        d="M12 2.5l2.92 6.07 6.58.94-4.76 4.62 1.13 6.55L12 17.6l-5.87 3.08 1.13-6.55L2.5 9.51l6.58-.94L12 2.5z"
      />
    </svg>
  );
}
