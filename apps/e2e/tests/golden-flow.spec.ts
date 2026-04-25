import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

const runId = Date.now();
const companyOwner = {
  name: `E2E Company Owner ${runId}`,
  email: `owner+${runId}@e2e.test`,
  password: 'Company123!',
};
const trainer = {
  name: `E2E Trainer ${runId}`,
  email: `trainer+${runId}@e2e.test`,
  password: 'Trainer123!',
};
const adminCreds = {
  email: process.env.E2E_ADMIN_EMAIL ?? 'admin@trainova.ai',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin12345!',
};

const requestTitle = `E2E Regression Request ${runId}`;
const requestDescription =
  'Automated regression: fine-tune a small LLM to follow a strict JSON output schema for medical triage prompts.';
const coverLetter =
  'Automated regression cover letter — verifying the apply flow end-to-end with a cover letter longer than 20 characters.';

// Shared across the serial steps.
let requestSlug: string | null = null;

async function registerViaApi(
  role: 'COMPANY_OWNER' | 'TRAINER',
  name: string,
  email: string,
  password: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, name, role, locale: 'en' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API register failed (${res.status}): ${body}`);
  }
}

async function uiLogin(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 }),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
}

async function newLoggedInContext(
  browser: Browser,
  email: string,
  password: string,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await uiLogin(page, email, password);
  return { ctx, page };
}

test.describe.configure({ mode: 'serial' });

test.describe('Golden E2E flow — 11 steps', () => {
  test('T1: Company register form loads and registration lands on company dashboard', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto('/en/register');
      await expect(page.getByRole('heading', { name: /create your trainova account/i })).toBeVisible();

      await registerViaApi('COMPANY_OWNER', companyOwner.name, companyOwner.email, companyOwner.password);
      await uiLogin(page, companyOwner.email, companyOwner.password);

      await expect(page).toHaveURL(/\/en\/company\/dashboard$/);
      await expect(page.getByRole('heading', { name: new RegExp(companyOwner.name, 'i') })).toBeVisible();

      const cookies = await ctx.cookies();
      expect(cookies.find((c) => c.name === 'trainova_token')?.value).toBeTruthy();
      expect(cookies.find((c) => c.name === 'trainova_role')?.value).toBe('COMPANY_OWNER');
    } finally {
      await ctx.close();
    }
  });

  test('T2: Company posts a job request and it appears on the dashboard list', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, companyOwner.email, companyOwner.password);
    try {
      await page.goto('/en/company/requests/new');
      await expect(page.getByRole('heading', { name: /post a new request/i })).toBeVisible();

      await page.getByLabel('Title').fill(requestTitle);
      await page.getByLabel('Description').fill(requestDescription);

      // Pick the first skill chip inside the form (scoped so we don't click the
      // locale switcher or any other button[type=button] elsewhere on the page).
      const form = page.locator('form.card');
      await form.locator('button[type="button"]').first().click();

      await Promise.all([
        page.waitForURL(/\/en\/company\/dashboard$/, { timeout: 15_000 }),
        page.getByRole('button', { name: /^submit$/i }).click(),
      ]);

      await expect(page.getByRole('link', { name: requestTitle })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('T3: Request is visible on the public marketplace listing (no auth)', async ({ browser }) => {
    const publicCtx = await browser.newContext();
    const publicPage = await publicCtx.newPage();
    try {
      await publicPage.goto('/en/requests');
      const link = publicPage.getByRole('link', { name: requestTitle }).first();
      await expect(link).toBeVisible({ timeout: 15_000 });
      const href = await link.getAttribute('href');
      expect(href).toBeTruthy();
      requestSlug = href!.split('/').pop()!;

      await publicPage.goto(href!);
      await expect(publicPage.getByRole('heading', { name: requestTitle })).toBeVisible();
    } finally {
      await publicCtx.close();
    }
  });

  test('T4: Trainer register form loads and registration lands on trainer dashboard', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await page.goto('/en/register?role=TRAINER');
      await expect(page.getByRole('heading', { name: /create your trainova account/i })).toBeVisible();

      await registerViaApi('TRAINER', trainer.name, trainer.email, trainer.password);
      await uiLogin(page, trainer.email, trainer.password);

      await expect(page).toHaveURL(/\/en\/trainer\/dashboard$/);
      const cookies = await ctx.cookies();
      expect(cookies.find((c) => c.name === 'trainova_role')?.value).toBe('TRAINER');
    } finally {
      await ctx.close();
    }
  });

  test('T5: Trainer applies to the request and sees the emerald success banner', async ({ browser }) => {
    expect(requestSlug, 'requestSlug was captured in T3').toBeTruthy();

    const { ctx, page } = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await page.goto(`/en/requests/${requestSlug}`);
      await expect(page.getByRole('heading', { name: requestTitle })).toBeVisible();

      // The apply form labels are not wired with htmlFor/id, so select inputs
      // by role + position within the scoped apply card instead.
      const applyCard = page.locator('aside .card', { has: page.getByRole('heading', { name: /^apply$/i }) });
      await applyCard.getByRole('textbox').first().fill(coverLetter);
      const numbers = applyCard.locator('input[type="number"]');
      await numbers.nth(0).fill('45');
      await numbers.nth(1).fill('30');
      await applyCard.getByRole('button', { name: /^submit$/i }).click();

      // Emerald success banner — binary proof of the ZodValidationPipe fix (PR #1).
      const banner = page.getByText('Application submitted', { exact: false });
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner).toHaveClass(/emerald/);
    } finally {
      await ctx.close();
    }
  });

  test('T6: Company sees the new application and can shortlist it (status + audit history)', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, companyOwner.email, companyOwner.password);
    try {
      await page.goto('/en/company/dashboard');
      // Scope to the "My requests" list so we don't match header/nav links.
      const myRequests = page.locator('section', { has: page.getByRole('heading', { name: /^my requests/i }) });
      await myRequests.getByRole('link', { name: /^open$/i }).first().click();
      await expect(page).toHaveURL(/\/en\/company\/requests\/[^/]+\/applications$/);
      await expect(page.getByRole('heading', { name: /^applications$/i })).toBeVisible();
      await expect(page.getByText(trainer.name)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(coverLetter.slice(0, 30))).toBeVisible();

      // Tier 1.D: status badge + transition action + audit entry.
      const badge = page.getByTestId('application-status-badge').first();
      await expect(badge).toHaveAttribute('data-status', 'APPLIED');

      // Open the shortlist confirm pane, leave a note, submit.
      await page.getByTestId('application-action-shortlisted').first().click();
      await page.getByLabel('Note to the internal audit trail', { exact: false }).fill(
        'Automated regression: shortlisting from E2E.',
      );
      await page.getByRole('button', { name: /^submit$/i }).click();

      // Badge flips to SHORTLISTED ("In review").
      await expect(badge).toHaveAttribute('data-status', 'SHORTLISTED', { timeout: 15_000 });

      // Detail page shows the audit history row we just created.
      await page.getByRole('link', { name: /view detail/i }).first().click();
      await expect(page).toHaveURL(/\/en\/company\/requests\/[^/]+\/applications\/[^/]+$/);
      const history = page.getByTestId('application-history');
      await expect(history).toBeVisible();
      await expect(history).toContainText('APPLIED');
      await expect(history).toContainText('SHORTLISTED');
      await expect(history).toContainText('Automated regression: shortlisting from E2E.');
    } finally {
      await ctx.close();
    }
  });

  test('T7: Admin KPI overview renders five KPI cards', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, adminCreds.email, adminCreds.password);
    try {
      await expect(page).toHaveURL(/\/en\/admin$/);
      await expect(page.getByRole('heading', { name: /^overview$/i })).toBeVisible();

      const kpiSection = page.locator('section.grid').first();
      await expect(kpiSection.locator('> div')).toHaveCount(5);
    } finally {
      await ctx.close();
    }
  });

  test('T8: Admin sub-pages (users, companies, requests) load', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, adminCreds.email, adminCreds.password);
    try {
      for (const sub of ['users', 'companies', 'requests']) {
        await page.goto(`/en/admin/${sub}`);
        await expect(page).toHaveURL(new RegExp(`/en/admin/${sub}$`));
        await expect(page.locator('h1').first()).toBeVisible();
      }
    } finally {
      await ctx.close();
    }
  });

  test('T9: Arabic admin renders with dir="rtl" and Arabic heading', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, adminCreds.email, adminCreds.password);
    try {
      await page.goto('/ar/admin');
      await expect(page).toHaveURL(/\/ar\/admin$/);
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.getByRole('heading', { name: 'نظرة عامة' })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('T10: Logout clears cookies and returns header to unauthenticated state', async ({ browser }) => {
    const { ctx, page } = await newLoggedInContext(browser, companyOwner.email, companyOwner.password);
    try {
      const before = await ctx.cookies();
      expect(before.find((c) => c.name === 'trainova_token')?.value).toBeTruthy();

      // Navigate directly to the route handler so the redirect chain runs.
      await page.goto('/api/logout?locale=en');

      await expect(page).toHaveURL(/\/en(\/(login)?)?$/);
      const after = await ctx.cookies();
      expect(after.find((c) => c.name === 'trainova_token')).toBeUndefined();
      expect(after.find((c) => c.name === 'trainova_role')).toBeUndefined();

      // Fresh load picks up the cleared cookies and shows unauthenticated CTAs
      // in the header (banner). Scope to banner to avoid matching the hero CTA.
      await page.goto('/en');
      const header = page.getByRole('banner');
      await expect(header.getByRole('link', { name: /^sign in$/i })).toBeVisible();
      await expect(header.getByRole('link', { name: /^get started$/i })).toBeVisible();
      await expect(header.getByRole('link', { name: /^sign out$/i })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });

  test('T11: Swagger /docs loads with the expected tag set', async ({ page }) => {
    const res = await page.request.get(`${API_BASE_URL}/docs-json`);
    expect(res.status()).toBe(200);
    const doc = (await res.json()) as {
      tags?: { name: string }[];
      paths: Record<string, Record<string, { tags?: string[] }>>;
    };

    // NestJS @ApiTags decorates operations but doesn't populate the top-level
    // `tags` array unless DocumentBuilder.addTag() is called. Derive tags from
    // operation-level entries so the assertion is stable either way.
    const operationTags = new Set<string>();
    for (const methods of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(methods)) {
        for (const tag of op.tags ?? []) operationTags.add(tag);
      }
    }
    const tagNames = [...operationTags].sort();
    const expected = [
      'admin',
      'admin-cms',
      'admin-finance',
      'admin-settings',
      'ads',
      'applications',
      'auth',
      'chat',
      'cms',
      'companies',
      'currency',
      'health',
      'job-requests',
      'models',
      'payments',
      'public',
      'reports',
      'skills',
      'tests',
      'trainers',
      'uploads',
      'users',
      'verification',
      'workbench',
    ];
    expect(tagNames).toEqual(expected);

    await page.goto(`${API_BASE_URL}/docs`);
    await expect(page.locator('.swagger-ui').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /trainova ai api/i })).toBeVisible();
  });
});
