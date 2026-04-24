'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'danger' | 'success';
  confirm?: string;
  disabled?: boolean;
  className?: string;
}

const VARIANTS: Record<NonNullable<Props['variant']>, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700',
  ghost: 'bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
};

export function ActionButton({ children, variant = 'primary', confirm, disabled, className }: Props) {
  const { pending } = useFormStatus();
  const onClick = confirm
    ? (e: React.MouseEvent<HTMLButtonElement>) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }
    : undefined;
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      onClick={onClick}
      className={
        'inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ' +
        VARIANTS[variant] +
        (className ? ' ' + className : '')
      }
    >
      {pending ? '…' : children}
    </button>
  );
}
