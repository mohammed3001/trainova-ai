'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { startKycAction } from './actions';

interface Labels {
  documentType: string;
  documentCountry: string;
  passport: string;
  nationalId: string;
  driverLicense: string;
  submit: string;
  error: string;
}

export function StartKycForm({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[1fr,160px,auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const ok = await startKycAction(fd);
          if (ok) {
            router.refresh();
          } else {
            setError(labels.error);
          }
        });
      }}
    >
      <label className="text-sm">
        <span className="block text-xs font-semibold text-slate-600">{labels.documentType}</span>
        <select
          name="documentType"
          defaultValue="PASSPORT"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        >
          <option value="PASSPORT">{labels.passport}</option>
          <option value="NATIONAL_ID">{labels.nationalId}</option>
          <option value="DRIVER_LICENSE">{labels.driverLicense}</option>
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-xs font-semibold text-slate-600">{labels.documentCountry}</span>
        <input
          name="documentCountry"
          required
          maxLength={2}
          minLength={2}
          pattern="[A-Z]{2}"
          placeholder="US"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm uppercase focus:border-brand-400 focus:ring-2 focus:ring-brand-200"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? '…' : labels.submit}
      </button>
      {error ? (
        <p className="col-span-full text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
