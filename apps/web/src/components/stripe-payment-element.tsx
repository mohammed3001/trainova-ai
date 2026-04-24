'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';

/**
 * Reusable Stripe Elements wrapper that:
 *   1. Fetches a SetupIntent client_secret from our backend.
 *   2. Mounts <PaymentElement /> bound to that intent.
 *   3. On submit, confirms the SetupIntent and hands the resulting
 *      `payment_method` id back via `onConfirmed(pmId)`.
 *
 * The caller is responsible for using that id — subscribing to a plan,
 * funding a milestone, etc. We keep the flow idempotent: each mount
 * pulls a fresh client_secret so a user who navigates away and back
 * gets a fresh intent rather than replaying a stale one.
 */

interface Props {
  /**
   * Called once Stripe returns a saved PaymentMethod id.
   * Returning a rejecting promise will surface the error to the user.
   */
  onConfirmed: (paymentMethodId: string) => Promise<void> | void;
  /** Localised button label for the primary "save" action. */
  submitLabel: string;
  /** Short label shown above the form. */
  title?: string;
  /** Supporting copy under the title. */
  hint?: string;
}

export function StripePaymentElement(props: Props) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'unconfigured'; message: string }
    | { kind: 'ready'; clientSecret: string; stripePromise: Promise<Stripe | null> }
    | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/proxy/billing/setup-intent', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `request failed (${res.status})`);
        }
        const body = (await res.json()) as {
          clientSecret: string;
          publishableKey: string | null;
        };
        const pk =
          body.publishableKey ?? process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
        if (!pk) {
          if (!cancelled) {
            setState({
              kind: 'unconfigured',
              message:
                'Stripe publishable key is not configured on this deployment.',
            });
          }
          return;
        }
        const stripePromise = loadStripe(pk);
        if (cancelled) return;
        setState({
          kind: 'ready',
          clientSecret: body.clientSecret,
          stripePromise,
        });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: (err as Error).message || 'Failed to start Stripe Elements',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return <ElementsShell>Loading secure payment form…</ElementsShell>;
  }
  if (state.kind === 'unconfigured') {
    return <ElementsShell tone="warn">{state.message}</ElementsShell>;
  }
  if (state.kind === 'error') {
    return <ElementsShell tone="error">{state.message}</ElementsShell>;
  }

  return (
    <Elements
      stripe={state.stripePromise}
      options={{
        clientSecret: state.clientSecret,
        appearance: { theme: 'stripe' },
      }}
    >
      <InnerForm {...props} />
    </Elements>
  );
}

function InnerForm({ onConfirmed, submitLabel, title, hint }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: submitErr } = await elements.submit();
      if (submitErr) {
        setError(submitErr.message ?? 'Card details are invalid');
        return;
      }
      const { error: confirmErr, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      });
      if (confirmErr) {
        setError(confirmErr.message ?? 'Stripe rejected the card');
        return;
      }
      const pmId =
        typeof setupIntent?.payment_method === 'string'
          ? setupIntent.payment_method
          : setupIntent?.payment_method?.id ?? null;
      if (!pmId) {
        setError('Stripe did not return a saved payment method id');
        return;
      }
      await onConfirmed(pmId);
    } catch (err) {
      setError((err as Error).message ?? 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-white/40 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/60"
    >
      {title ? (
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h3>
      ) : null}
      {hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
      ) : null}
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? (
        <p className="rounded-md border border-rose-300/60 bg-rose-50/70 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="btn-primary w-full disabled:opacity-60"
      >
        {submitting ? '…' : submitLabel}
      </button>
    </form>
  );
}

function ElementsShell({
  children,
  tone = 'info',
}: {
  children: React.ReactNode;
  tone?: 'info' | 'warn' | 'error';
}) {
  const cls = useMemo(() => {
    const base =
      'rounded-2xl border p-5 text-sm backdrop-blur-md shadow-sm';
    if (tone === 'warn') {
      return `${base} border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200`;
    }
    if (tone === 'error') {
      return `${base} border-rose-300/60 bg-rose-50/70 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200`;
    }
    return `${base} border-white/40 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-slate-900/60 dark:text-slate-300`;
  }, [tone]);
  return <div className={cls}>{children}</div>;
}
