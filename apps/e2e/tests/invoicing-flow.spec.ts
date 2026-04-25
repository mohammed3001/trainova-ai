import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const adminCreds = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@trainova.ai',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345!',
};

const runId = Date.now();
const company = {
  name: `Tax Company ${runId}`,
  email: `taxowner+${runId}@e2e.test`,
  password: 'Company123!',
};
const trainer = {
  name: `Tax Trainer ${runId}`,
  email: `taxtrainer+${runId}@e2e.test`,
  password: 'Trainer123!',
};

async function apiJson<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`API ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function register(
  role: 'COMPANY_OWNER' | 'TRAINER',
  name: string,
  email: string,
  password: string,
): Promise<string> {
  const body = await apiJson<{ accessToken: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, role, locale: 'en' }),
  });
  return body.accessToken;
}

async function login(email: string, password: string): Promise<string> {
  const body = await apiJson<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return body.accessToken;
}

test.describe.configure({ mode: 'serial' });

test.describe('T6.C invoicing — tax profiles, admin tax rules, invoice listings', () => {
  let companyToken: string;
  let trainerToken: string;
  let adminToken: string;

  test('I1: Register buyer + seller, sign in as admin', async () => {
    companyToken = await register('COMPANY_OWNER', company.name, company.email, company.password);
    trainerToken = await register('TRAINER', trainer.name, trainer.email, trainer.password);
    adminToken = await login(adminCreds.email, adminCreds.password);
  });

  test('I2: Trainer upserts a tax profile and retrieves it', async () => {
    const upserted = await apiJson<{
      countryCode: string;
      kind: string;
      legalName: string | null;
      taxId: string | null;
      taxIdVerified: boolean;
    }>('/me/tax-profile', {
      method: 'PUT',
      token: trainerToken,
      body: JSON.stringify({
        countryCode: 'SA',
        kind: 'INDIVIDUAL',
        legalName: 'Tax Trainer Legal Name',
        taxId: '300000000000003',
        city: 'Riyadh',
      }),
    });
    expect(upserted.countryCode).toBe('SA');
    expect(upserted.taxId).toBe('300000000000003');
    // Self-serve upsert must not auto-verify the tax id — that is an
    // admin-only transition.
    expect(upserted.taxIdVerified).toBe(false);

    const fetched = await apiJson<{ profile: { countryCode: string } | null }>(
      '/me/tax-profile',
      { token: trainerToken },
    );
    expect(fetched.profile?.countryCode).toBe('SA');
  });

  test('I3: Company owner upserts a tax profile (different jurisdiction)', async () => {
    const upserted = await apiJson<{ countryCode: string; kind: string }>(
      '/me/tax-profile',
      {
        method: 'PUT',
        token: companyToken,
        body: JSON.stringify({
          countryCode: 'DE',
          kind: 'BUSINESS',
          legalName: 'Tax Company GmbH',
          taxId: 'DE123456789',
          city: 'Berlin',
        }),
      },
    );
    expect(upserted.countryCode).toBe('DE');
    expect(upserted.kind).toBe('BUSINESS');
  });

  test('I4: Admin lists tax rules and sees the 11 seeded jurisdictions', async () => {
    const rules = await apiJson<
      Array<{ countryCode: string; rateBps: number; active: boolean }>
    >('/admin/tax-rules', { token: adminToken });
    // Migration seeded SA, AE, EG, DE, FR, ES, GB, US, CA, AU, IN.
    const codes = rules.map((r) => r.countryCode).sort();
    for (const expected of ['AE', 'AU', 'CA', 'DE', 'EG', 'ES', 'FR', 'GB', 'IN', 'SA', 'US']) {
      expect(codes).toContain(expected);
    }
    const sa = rules.find((r) => r.countryCode === 'SA');
    expect(sa?.rateBps).toBe(1500);
    expect(sa?.active).toBe(true);
  });

  test('I5: Admin upserts a new rule, updates it, then deletes it', async () => {
    const created = await apiJson<{ countryCode: string; rateBps: number; label: string }>(
      '/admin/tax-rules',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          countryCode: 'NZ',
          label: 'GST',
          kind: 'GST',
          rateBps: 1500,
          b2bReverseCharge: false,
          exportZeroRated: true,
          active: true,
        }),
      },
    );
    expect(created.countryCode).toBe('NZ');
    expect(created.rateBps).toBe(1500);

    const updated = await apiJson<{ rateBps: number }>('/admin/tax-rules/NZ', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({
        label: 'GST',
        kind: 'GST',
        rateBps: 1250,
        b2bReverseCharge: false,
        exportZeroRated: true,
        active: true,
      }),
    });
    expect(updated.rateBps).toBe(1250);

    const deleted = await apiJson<{ ok: boolean }>('/admin/tax-rules/NZ', {
      method: 'DELETE',
      token: adminToken,
    });
    expect(deleted.ok).toBe(true);
  });

  test('I6: Non-admin cannot hit the tax-rules catalog', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/tax-rules`, {
      headers: { authorization: `Bearer ${trainerToken}` },
    });
    expect([401, 403]).toContain(res.status);
  });

  test('I7: Invoice listings return an empty, well-shaped payload pre-funding', async () => {
    const companyInvoices = await apiJson<{
      items: unknown[];
      nextCursor: string | null;
    }>('/billing/invoices', { token: companyToken });
    expect(Array.isArray(companyInvoices.items)).toBe(true);
    expect(companyInvoices.items).toHaveLength(0);
    expect(companyInvoices.nextCursor).toBeNull();

    const trainerStatements = await apiJson<{
      items: unknown[];
      nextCursor: string | null;
    }>('/trainer-payments/statements', { token: trainerToken });
    expect(Array.isArray(trainerStatements.items)).toBe(true);
    expect(trainerStatements.items).toHaveLength(0);
    expect(trainerStatements.nextCursor).toBeNull();
  });

  test('I8: Invoice listings reject unauthenticated requests', async () => {
    const cres = await fetch(`${API_BASE_URL}/api/billing/invoices`);
    expect(cres.status).toBe(401);
    const tres = await fetch(`${API_BASE_URL}/api/trainer-payments/statements`);
    expect(tres.status).toBe(401);
  });

  test('I9: Admin verifies the trainer tax id and sees the flag flip', async () => {
    // Resolve trainer userId via admin users list.
    const users = await apiJson<{
      items: Array<{ id: string; email: string }>;
    }>(`/admin/users?q=${encodeURIComponent(trainer.email)}`, {
      token: adminToken,
    });
    const trainerUser = users.items.find((u) => u.email === trainer.email);
    expect(trainerUser).toBeTruthy();

    const verified = await apiJson<{ taxIdVerified: boolean }>(
      `/admin/tax-rules/profiles/${trainerUser!.id}/verify`,
      {
        method: 'PUT',
        token: adminToken,
        body: JSON.stringify({ verified: true }),
      },
    );
    expect(verified.taxIdVerified).toBe(true);

    const fetched = await apiJson<{ profile: { taxIdVerified: boolean } | null }>(
      '/me/tax-profile',
      { token: trainerToken },
    );
    expect(fetched.profile?.taxIdVerified).toBe(true);
  });
});
