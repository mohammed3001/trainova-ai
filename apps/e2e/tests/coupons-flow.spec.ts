import { test, expect } from '@playwright/test';

/**
 * T7.E — Coupons & Promotions golden-flow.
 *
 * Covers:
 *   1. Admin creates a PERCENT MILESTONE coupon (audience=COMPANY).
 *   2. Company previews the coupon → discount math is correct.
 *   3. Audience guard: trainer cannot redeem a COMPANY-only coupon.
 *   4. Scope guard: a SUBSCRIPTION-only coupon is rejected at MILESTONE
 *      preview, and vice versa.
 *   5. Disable lifecycle: once disabled, preview returns 4xx.
 *
 * The PaymentIntent / Stripe leg is exercised in invoicing-flow.spec.ts;
 * here we focus on coupon validation & discount math, which are
 * deterministic and don't need a Stripe round-trip.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';
const adminCreds = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@trainova.ai',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345!',
};

const runId = Date.now();
const company = {
  name: `Coupon Company ${runId}`,
  email: `couponowner+${runId}@e2e.test`,
  password: 'Company123!',
};
const trainer = {
  name: `Coupon Trainer ${runId}`,
  email: `coupontrainer+${runId}@e2e.test`,
  password: 'Trainer123!',
};

const PERCENT_CODE = `PCT${runId.toString().slice(-7)}`; // PERCENT 20% off, COMPANY+MILESTONE
const FIXED_CODE = `FIX${runId.toString().slice(-7)}`; // FIXED $5 off, ANY+SUBSCRIPTION
const DISABLED_CODE = `OFF${runId.toString().slice(-7)}`; // PERCENT 50% off, then disabled

async function apiJson<T>(
  path: string,
  init: RequestInit & { token?: string; expectStatus?: number } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API_BASE_URL}/api${path}`, { ...init, headers });
  const text = await res.text();
  if (init.expectStatus != null) {
    expect(res.status, `${init.method ?? 'GET'} ${path} → ${text}`).toBe(init.expectStatus);
  } else if (!res.ok) {
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

test.describe('T7.E coupons — admin CRUD + preview discount math + audience/scope guards', () => {
  let adminToken: string;
  let companyToken: string;
  let trainerToken: string;

  test('C0: Sign in admin, register company + trainer', async () => {
    adminToken = await login(adminCreds.email, adminCreds.password);
    companyToken = await register('COMPANY_OWNER', company.name, company.email, company.password);
    trainerToken = await register('TRAINER', trainer.name, trainer.email, trainer.password);
    expect(adminToken).toBeTruthy();
    expect(companyToken).toBeTruthy();
    expect(trainerToken).toBeTruthy();
  });

  test('C1: Admin creates a PERCENT MILESTONE COMPANY-only coupon (20% off)', async () => {
    const created = await apiJson<{ id: string; code: string; status: string }>(
      '/admin/coupons',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          code: PERCENT_CODE,
          description: '20% off milestones for companies',
          kind: 'PERCENT',
          amountOff: 2000, // 20.00% in basis points
          audience: 'COMPANY',
          appliesTo: 'MILESTONE',
          perUserLimit: 5,
          maxDiscountMinor: 50_000, // cap at $500
        }),
      },
    );
    expect(created.code).toBe(PERCENT_CODE);
    expect(created.status).toBe('ACTIVE');
  });

  test('C2: Admin creates a FIXED SUBSCRIPTION coupon ($5 off, ANY audience)', async () => {
    const created = await apiJson<{ code: string; kind: string }>('/admin/coupons', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        code: FIXED_CODE,
        description: '$5 off any subscription',
        kind: 'FIXED',
        amountOff: 500, // $5.00 in cents
        currency: 'USD',
        audience: 'ANY',
        appliesTo: 'SUBSCRIPTION',
        perUserLimit: 1,
      }),
    });
    expect(created.code).toBe(FIXED_CODE);
    expect(created.kind).toBe('FIXED');
  });

  test('C3: Company previews PERCENT coupon on MILESTONE → 20% discount applied', async () => {
    const preview = await apiJson<{
      code: string;
      discountMinor: number;
      finalMinor: number;
      originalMinor: number;
    }>('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: PERCENT_CODE,
        scope: 'MILESTONE',
        amountMinor: 100_00, // $100.00
        currency: 'USD',
      }),
    });
    expect(preview.code).toBe(PERCENT_CODE);
    expect(preview.originalMinor).toBe(100_00);
    expect(preview.discountMinor).toBe(20_00); // 20% of $100
    expect(preview.finalMinor).toBe(80_00); // $80
  });

  test('C4: PERCENT coupon respects maxDiscountMinor cap', async () => {
    // 20% of $5,000 would be $1,000, but cap is $500.
    const preview = await apiJson<{ discountMinor: number; finalMinor: number }>(
      '/coupons/preview',
      {
        method: 'POST',
        token: companyToken,
        body: JSON.stringify({
          code: PERCENT_CODE,
          scope: 'MILESTONE',
          amountMinor: 5000_00,
          currency: 'USD',
        }),
      },
    );
    expect(preview.discountMinor).toBe(500_00); // capped at $500
    expect(preview.finalMinor).toBe(4500_00);
  });

  test('C5: TRAINER cannot redeem COMPANY-only coupon (audience guard)', async () => {
    // Audience/scope/expiry/disabled guards are authorization-style
    // rejections — the server returns 403 (ForbiddenException), not 400.
    await apiJson('/coupons/preview', {
      method: 'POST',
      token: trainerToken,
      body: JSON.stringify({
        code: PERCENT_CODE,
        scope: 'MILESTONE',
        amountMinor: 100_00,
        currency: 'USD',
      }),
      expectStatus: 403,
    });
  });

  test('C6: MILESTONE coupon rejected at SUBSCRIPTION scope (scope guard)', async () => {
    await apiJson('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: PERCENT_CODE,
        scope: 'SUBSCRIPTION',
        amountMinor: 100_00,
        currency: 'USD',
      }),
      expectStatus: 403,
    });
  });

  test('C7: SUBSCRIPTION-only coupon rejected at MILESTONE scope (scope guard)', async () => {
    await apiJson('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: FIXED_CODE,
        scope: 'MILESTONE',
        amountMinor: 100_00,
        currency: 'USD',
      }),
      expectStatus: 403,
    });
  });

  test('C8: FIXED coupon rejects mismatched currency', async () => {
    await apiJson('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: FIXED_CODE,
        scope: 'SUBSCRIPTION',
        amountMinor: 100_00,
        currency: 'EUR',
      }),
      expectStatus: 400,
    });
  });

  test('C9: Unknown coupon code returns 404 / 400', async () => {
    const res = await fetch(`${API_BASE_URL}/api/coupons/preview`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${companyToken}`,
      },
      body: JSON.stringify({
        code: `NOPE${runId.toString().slice(-5)}`,
        scope: 'MILESTONE',
        amountMinor: 100_00,
        currency: 'USD',
      }),
    });
    expect([400, 404]).toContain(res.status);
  });

  test('C10: Admin disables a coupon → preview rejects it', async () => {
    const created = await apiJson<{ id: string; code: string }>('/admin/coupons', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        code: DISABLED_CODE,
        kind: 'PERCENT',
        amountOff: 5000, // 50%
        audience: 'ANY',
        appliesTo: 'MILESTONE',
      }),
    });

    // Pre-disable: preview succeeds.
    const okPreview = await apiJson<{ discountMinor: number }>('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: DISABLED_CODE,
        scope: 'MILESTONE',
        amountMinor: 200_00,
        currency: 'USD',
      }),
    });
    expect(okPreview.discountMinor).toBe(100_00); // 50% of $200

    // Disable.
    await apiJson(`/admin/coupons/${created.id}`, {
      method: 'DELETE',
      token: adminToken,
    });

    // Post-disable: preview is rejected with 403 (status !== 'ACTIVE'
    // is treated as an authorization-style rejection, same as audience
    // and scope guards).
    await apiJson('/coupons/preview', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: DISABLED_CODE,
        scope: 'MILESTONE',
        amountMinor: 200_00,
        currency: 'USD',
      }),
      expectStatus: 403,
    });
  });

  test('C11: Admin lists coupons and finds the ones we created', async () => {
    const list = await apiJson<{
      items: Array<{ code: string; status: string }>;
      total: number;
    }>('/admin/coupons?pageSize=100', { token: adminToken });
    const codes = list.items.map((c) => c.code);
    expect(codes).toContain(PERCENT_CODE);
    expect(codes).toContain(FIXED_CODE);
    expect(codes).toContain(DISABLED_CODE);
    const disabled = list.items.find((c) => c.code === DISABLED_CODE);
    expect(disabled?.status).toBe('DISABLED');
  });

  test('C12: Non-admin (company) cannot create coupons', async () => {
    await apiJson('/admin/coupons', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        code: `CO${runId.toString().slice(-7)}`,
        kind: 'PERCENT',
        amountOff: 1000,
      }),
      expectStatus: 403,
    });
  });
});
