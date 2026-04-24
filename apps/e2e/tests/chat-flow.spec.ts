import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:4000';

const runId = Date.now();
const companyOwner = {
  name: `Chat Company ${runId}`,
  email: `chatowner+${runId}@e2e.test`,
  password: 'Company123!',
};
const trainer = {
  name: `Chat Trainer ${runId}`,
  email: `chattrainer+${runId}@e2e.test`,
  password: 'Trainer123!',
};
const requestTitle = `Chat Flow Regression Request ${runId}`;
const companyMessage = `Company→Trainer hello ${runId}`;
const trainerMessage = `Trainer→Company reply ${runId}`;

let companyToken: string | null = null;
let trainerToken: string | null = null;
let companyUserId: string | null = null;
let trainerUserId: string | null = null;
let requestId: string | null = null;
let applicationId: string | null = null;
let conversationId: string | null = null;

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
): Promise<{ accessToken: string; userId: string }> {
  const body = await apiJson<{ accessToken: string; user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name, role, locale: 'en' }),
  });
  return { accessToken: body.accessToken, userId: body.user.id };
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

test.describe('Chat flow — shortlist → start chat → exchange → read receipts', () => {
  test('H1: Company + trainer register, post request, apply, shortlist', async () => {
    const c = await register('COMPANY_OWNER', companyOwner.name, companyOwner.email, companyOwner.password);
    const t = await register('TRAINER', trainer.name, trainer.email, trainer.password);
    companyToken = c.accessToken;
    companyUserId = c.userId;
    trainerToken = t.accessToken;
    trainerUserId = t.userId;

    const req = await apiJson<{ id: string }>('/job-requests', {
      method: 'POST',
      token: companyToken!,
      body: JSON.stringify({
        title: requestTitle,
        description: 'Automated regression request for chat flow.',
        skills: [],
        languages: [],
      }),
    });
    requestId = req.id;

    const app = await apiJson<{ id: string }>('/applications', {
      method: 'POST',
      token: trainerToken!,
      body: JSON.stringify({
        requestId,
        coverLetter: 'Chat regression trainer.',
        proposedRate: 50,
        proposedTimelineDays: 14,
      }),
    });
    applicationId = app.id;

    await apiJson(`/applications/${applicationId}/status`, {
      method: 'PATCH',
      token: companyToken!,
      body: JSON.stringify({ status: 'SHORTLISTED', reason: 'Ready for chat.' }),
    });
  });

  test('H2: Company opens applicant detail, starts chat with trainer', async ({ browser }) => {
    expect(applicationId && requestId && trainerUserId).toBeTruthy();
    const { ctx, page } = await newLoggedInContext(browser, companyOwner.email, companyOwner.password);
    try {
      await page.goto(`/en/company/requests/${requestId}/applications/${applicationId}`);

      const startBtn = page.getByTestId('company-message-trainer');
      await expect(startBtn).toBeVisible();

      await Promise.all([
        page.waitForURL((url) => /\/en\/chat\/[a-z0-9]+/i.test(url.pathname), { timeout: 15_000 }),
        startBtn.click(),
      ]);

      const match = page.url().match(/\/chat\/([^/?#]+)/);
      expect(match).not.toBeNull();
      conversationId = match![1];

      await expect(page.getByTestId('chat-other-name')).toBeVisible();
      await page.getByTestId('chat-input').fill(companyMessage);
      await Promise.all([
        page.waitForResponse(
          (r) => r.url().includes('/chat/messages') && r.request().method() === 'POST',
        ),
        page.getByTestId('chat-send').click(),
      ]);
      await expect(page.getByTestId('chat-scroll')).toContainText(companyMessage);
    } finally {
      await ctx.close();
    }
  });

  test('H3: Trainer sees unread badge, opens room, replies, company sees reply', async ({ browser }) => {
    expect(conversationId).toBeTruthy();

    const trainerCtx = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await trainerCtx.page.goto('/en/chat');
      const row = trainerCtx.page.getByTestId(`conv-row-${conversationId}`);
      await expect(row).toBeVisible();
      await expect(row.getByTestId('conv-unread')).toBeVisible();

      await row.click();
      await trainerCtx.page.waitForURL(`**/chat/${conversationId}`);

      await expect(trainerCtx.page.getByTestId('chat-scroll')).toContainText(companyMessage);

      await trainerCtx.page.getByTestId('chat-input').fill(trainerMessage);
      await Promise.all([
        trainerCtx.page.waitForResponse(
          (r) => r.url().includes('/chat/messages') && r.request().method() === 'POST',
        ),
        trainerCtx.page.getByTestId('chat-send').click(),
      ]);
    } finally {
      await trainerCtx.ctx.close();
    }

    // Company re-opens the room and sees the trainer's reply.
    const companyCtx = await newLoggedInContext(browser, companyOwner.email, companyOwner.password);
    try {
      await companyCtx.page.goto(`/en/chat/${conversationId}`);
      await expect(companyCtx.page.getByTestId('chat-scroll')).toContainText(trainerMessage);
    } finally {
      await companyCtx.ctx.close();
    }
  });

  test('H4: Trainer AR locale renders RTL and Arabic room copy', async ({ browser }) => {
    expect(conversationId).toBeTruthy();
    const { ctx, page } = await newLoggedInContext(browser, trainer.email, trainer.password);
    try {
      await page.goto(`/ar/chat/${conversationId}`);
      await expect(page.locator('html[dir="rtl"]')).toHaveCount(1);
      await expect(page.getByTestId('chat-other-name')).toBeVisible();
      await expect(page.getByTestId('chat-send')).toContainText('إرسال');
    } finally {
      await ctx.close();
    }
  });

  test('H5: Regression — reviewerNotes/answerKey must not leak into the chat conversation payload', async () => {
    expect(conversationId && trainerToken).toBeTruthy();
    const res = await fetch(`${API_BASE_URL}/api/chat/conversations/${conversationId}/messages`, {
      headers: { authorization: `Bearer ${trainerToken!}` },
    });
    const body = await res.text();
    expect(body).not.toContain('answerKey');
    expect(body).not.toContain('reviewerNotes');
  });
});
