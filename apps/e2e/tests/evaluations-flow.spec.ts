import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

const runId = Date.now();
const companyOwner = {
  name: `Eval Company ${runId}`,
  email: `evalowner+${runId}@e2e.test`,
  password: 'Company123!',
};
const trainer = {
  name: `Eval Trainer ${runId}`,
  email: `evaltrainer+${runId}@e2e.test`,
  password: 'Trainer123!',
};
const requestTitle = `Eval Flow Regression Request ${runId}`;
const requestDescription =
  'Automated regression for the evaluations flow — the trainer must answer MCQ + TEXT tasks and submit a graded attempt.';
const mcqPrompt = 'Which dataset split is used for final reporting?';
const mcqCorrect = 'Test';
const mcqOptions = ['Train', 'Validation', mcqCorrect, 'Dev'];
const textPrompt = 'In one sentence, describe hallucination mitigation via retrieval.';
const trainerTextAnswer =
  'Ground generations in retrieved documents so the model cites evidence instead of confabulating unsupported facts.';

// Shared across the serial steps.
let companyToken: string | null = null;
let trainerToken: string | null = null;
let requestId: string | null = null;
let applicationId: string | null = null;
let testId: string | null = null;

async function apiJson<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    ...((init.headers ?? {}) as Record<string, string>),
  };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${API_BASE_URL}/api${path}`, {
    ...init,
    headers,
  });
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

test.describe('Evaluations flow — company authors, trainer takes, company grades', () => {
  test('E1: Company + trainer register, company posts request, trainer applies (API)', async () => {
    companyToken = await register('COMPANY_OWNER', companyOwner.name, companyOwner.email, companyOwner.password);
    trainerToken = await register('TRAINER', trainer.name, trainer.email, trainer.password);

    const created = await apiJson<{ id: string }>('/job-requests', {
      method: 'POST',
      token: companyToken,
      body: JSON.stringify({
        title: requestTitle,
        description: requestDescription,
        skills: [],
        languages: [],
      }),
    });
    requestId = created.id;

    const application = await apiJson<{ id: string }>('/applications', {
      method: 'POST',
      token: trainerToken,
      body: JSON.stringify({
        requestId,
        coverLetter:
          'Automated regression trainer — applying to the evaluations flow regression request.',
        proposedRate: 50,
        proposedTimelineDays: 21,
      }),
    });
    applicationId = application.id;
  });

  test('E2: Company authors a test (MCQ + TEXT) and assigns it to the trainer', async () => {
    expect(companyToken && requestId && applicationId).toBeTruthy();

    const test = await apiJson<{ id: string }>('/tests', {
      method: 'POST',
      token: companyToken!,
      body: JSON.stringify({
        requestId,
        title: `Eval Test ${runId}`,
        description: 'Two-task evaluation used by the evaluations-flow regression.',
        passingScore: 60,
        scoringMode: 'HYBRID',
        tasks: [
          {
            type: 'MCQ',
            prompt: mcqPrompt,
            options: mcqOptions,
            answerKey: mcqCorrect,
            maxScore: 40,
            order: 0,
          },
          {
            type: 'TEXT',
            prompt: textPrompt,
            maxScore: 60,
            order: 1,
          },
        ],
      }),
    });
    testId = test.id;

    await apiJson(`/applications/${applicationId}/assign-test`, {
      method: 'POST',
      token: companyToken!,
      body: JSON.stringify({ testId }),
    });
  });

  test('E3: Trainer dashboard surfaces the assigned test with a "Take test" CTA', async ({ browser }) => {
    expect(applicationId).toBeTruthy();
    const { ctx, page } = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await page.goto('/en/trainer/dashboard');
      const row = page.getByTestId(`trainer-app-row-${applicationId}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(requestTitle);
      const cta = page.getByTestId(`trainer-test-cta-${applicationId}`);
      await expect(cta).toBeVisible();
      await expect(cta).toHaveText(/take test/i);
    } finally {
      await ctx.close();
    }
  });

  test('E4: Trainer opens the test page, starts, answers MCQ + TEXT, submits', async ({ browser }) => {
    expect(applicationId && testId).toBeTruthy();
    const { ctx, page } = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await page.goto(`/en/trainer/applications/${applicationId}/test`);
      await expect(page.getByTestId('trainer-test-taker')).toBeVisible();
      await expect(page.getByTestId('trainer-passing-hint')).toBeVisible();
      await expect(page.getByTestId('trainer-test-ready')).toBeVisible();

      await page.getByTestId('trainer-test-start').click();
      await expect(page.getByTestId('trainer-test-form')).toBeVisible({ timeout: 10_000 });

      // MCQ — pick the correct option (the 3rd one, index 2 in our options array).
      const mcqBlock = page.locator('[data-testid^="trainer-task-mcq-"]');
      await expect(mcqBlock).toBeVisible();
      // The test ID namespace for each option is
      // `trainer-task-<taskId>-opt-<index>`; we don't know the taskId, so
      // filter by the `opt-2` suffix under the MCQ block.
      await mcqBlock.locator('[data-testid$="-opt-2"]').click();

      // TEXT — fill the textarea inside the TEXT block.
      const textBlock = page.locator('[data-testid^="trainer-task-text-"]');
      await expect(textBlock).toBeVisible();
      await textBlock.locator('textarea').fill(trainerTextAnswer);

      // Intercept the native confirm() call so the submit goes through.
      page.once('dialog', (d) => d.accept());

      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/tests/attempts/') && r.url().endsWith('/submit') && r.request().method() === 'POST',
          { timeout: 10_000 },
        ),
        page.getByTestId('trainer-test-submit').click(),
      ]);

      // After submit + router.refresh(), we should see the result view in a
      // submitted (but ungraded) state — passingScore 60 with auto-score 40
      // (MCQ correct) means totalScore is null until HYBRID grading completes.
      const result = page.getByTestId('trainer-test-result');
      await expect(result).toBeVisible({ timeout: 15_000 });
      await expect(result).toHaveAttribute('data-status', /SUBMITTED|GRADED/);
    } finally {
      await ctx.close();
    }
  });

  test('E5: Company sees the attempt, grades it, trainer sees graded result + totalScore', async ({ browser }) => {
    expect(applicationId && companyToken).toBeTruthy();

    // Look up the attempt id server-side via the company-facing endpoint.
    interface AttemptListRow {
      id: string;
      status: string;
      test: { id: string; passingScore: number };
      responses: Array<{ taskId: string; task?: { type: string } }>;
    }
    const attempts = await apiJson<AttemptListRow[]>(
      `/applications/${applicationId}/attempts`,
      { token: companyToken! },
    );
    expect(attempts.length).toBeGreaterThan(0);
    const attempt = attempts[0]!;
    expect(attempt.status).toBe('SUBMITTED');

    // Grade all tasks to full marks via API — avoids UI flake here and keeps
    // the UI-facing parts of the spec focused on the trainer flow we added
    // in this PR. The grade endpoint is already covered by earlier specs.
    interface AttemptFull {
      test: { tasks: Array<{ id: string; type: string; maxScore: number }> };
    }
    const full = await apiJson<AttemptFull>(`/tests/attempts/${attempt.id}`, {
      token: companyToken!,
    });
    await apiJson(`/tests/attempts/${attempt.id}/grade`, {
      method: 'POST',
      token: companyToken!,
      body: JSON.stringify({
        grades: full.test.tasks.map((task) => ({
          taskId: task.id,
          manualScore: task.maxScore,
          comments: `Automated regression grade for ${task.type}.`,
        })),
        reviewerNotes: 'Automated regression reviewer notes (should not leak to trainer).',
      }),
    });

    const { ctx, page } = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await page.goto(`/en/trainer/applications/${applicationId}/test`);
      const result = page.getByTestId('trainer-test-result');
      await expect(result).toBeVisible({ timeout: 15_000 });
      await expect(result).toHaveAttribute('data-status', 'GRADED');
      await expect(page.getByTestId('trainer-total-score')).toBeVisible();
      // Reviewer notes are stripped server-side; the trainer page must not
      // render the literal string.
      await expect(page.locator('body')).not.toContainText(
        'Automated regression reviewer notes (should not leak to trainer).',
      );
    } finally {
      await ctx.close();
    }
  });
});
