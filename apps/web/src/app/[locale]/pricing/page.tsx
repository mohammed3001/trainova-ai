import { apiFetch } from '@/lib/api';

interface Plan {
  id: string;
  audience: string;
  tier: string;
  priceMonthly: number;
  priceYearly: number;
  featuresJson: Record<string, unknown> | null;
}

export default async function PricingPage() {
  const plans = await apiFetch<Plan[]>('/public/plans').catch(() => []);
  const companyPlans = plans.filter((p) => p.audience === 'COMPANY');
  const trainerPlans = plans.filter((p) => p.audience === 'TRAINER');
  return (
    <div className="space-y-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Pricing</h1>
        <p className="text-slate-500">Transparent plans for companies and trainers.</p>
      </header>
      <PlanGrid title="For Companies" plans={companyPlans} />
      <PlanGrid title="For Trainers" plans={trainerPlans} />
    </div>
  );
}

function PlanGrid({ title, plans }: { title: string; plans: Plan[] }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <article key={p.id} className="card">
            <div className="text-sm font-medium uppercase tracking-wide text-brand-700">{p.tier}</div>
            <div className="mt-2 text-3xl font-bold text-slate-900">
              ${p.priceMonthly}
              <span className="text-sm font-medium text-slate-500">/mo</span>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {Object.entries(p.featuresJson ?? {}).map(([key, value]) => (
                <li key={key}>
                  <b>{key}:</b> {String(value)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
