# Test Plan — PR #20 (Tier 2 PR C3) trainer test-taking UI

**PR:** https://github.com/mohammed3001/trainova-ai/pull/20 (merged into `main`)
**Target:** local stack on `http://localhost:3000` backed by `http://localhost:4000/api`, Postgres 16 + Redis 7 from `docker-compose.yml`, migrations applied.
**Evidence for paths/testids:** `apps/web/src/app/[locale]/trainer/applications/[appId]/test/test-taker.tsx` lines 133-275, `result-view.tsx` lines 17-76, `apps/web/src/app/[locale]/trainer/dashboard/page.tsx` lines 58-121, `apps/api/src/tests/tests.service.ts` lines 571-642, `apps/api/src/applications/applications.controller.ts` lines 109-114.

## What this PR actually changed (user-visible)

1. Trainer dashboard rows now render a per-application CTA when the application is `TEST_ASSIGNED` ("Take test", primary) or `TEST_SUBMITTED` ("View result", secondary). No CTA for other statuses.
2. New nested route `/[locale]/trainer/applications/[appId]/test`:
   - Before start: "Ready to start?" card + "Start attempt" button + a **passing-hint chip** (`Passing hint: ≥ N/100`).
   - After start: a form listing each task in order — MCQ = native radio group (one `name=answer-task-<taskId>` per task), TEXT = textarea. CODE tasks render the prompt but have no answering widget.
   - Submit: native `confirm()` ("won't be able to change after this"), POSTs, then `router.refresh()`.
   - Post-submit: a read-only "Attempt submitted" card with `data-status="SUBMITTED"` and an "awaiting reviewer grading" line.
   - After company grades: same card switches to `data-status="GRADED"`, shows `trainer-total-score` and a pass/miss line against the authored `passingScore`.
3. Backend: `GET /applications/:id/assigned-test` resolves `testId` from the latest attempt or the latest `APPLICATION_STATUS_CHANGED` audit entry, and strips `reviewerNotes` / `answerKey` / `rubric` from the trainer-facing payload.

## Primary flow to prove (one continuous recording)

Three fresh accounts in one run (suffix = timestamp) so the flow is independent of leftover data:

| Actor | Email | Password |
|---|---|---|
| Company owner | `c3co+<ts>@e2e.test` | `Company123!` |
| Trainer | `c3tr+<ts>@e2e.test` | `Trainer123!` |

### Step 1 — Company creates a request, authors a test, assigns it to the trainer
1.1. Register the company owner at `/en/register` (role=COMPANY_OWNER), land on `/en/company/dashboard`. **Pass:** URL ends with `/en/company/dashboard` and the header shows "Sign out". **Fail:** stays on `/en/register` or redirects to `/en/trainer/dashboard`.
1.2. Register the trainer in a second browser context (role=TRAINER), leave that tab on `/en/trainer/dashboard` (empty state). **Pass:** dashboard renders but has no rows. **Fail:** redirected away or a stale row appears.
1.3. As the company, create a request titled `C3 Eval Regression <ts>` via `/en/company/requests/new`. **Pass:** the new request row appears on the company dashboard. **Fail:** submit error banner, no row.
1.4. As the trainer, apply to that request from `/en/requests`. **Pass:** the green "requests.applied" state appears and the application shows on `/en/trainer/dashboard` with status `APPLIED`. **Fail:** red banner or no row.
1.5. As the company, open the applications list for the request and use the "Assign test" popover on the trainer's row. Author a two-task test inline:
   - MCQ prompt = `Which split is used for final reporting?`, options = `Train / Validation / Test / Dev`, answerKey = `Test`, maxScore = 40.
   - TEXT prompt = `One sentence on retrieval-grounded generation.`, maxScore = 60.
   - passingScore = 60, scoringMode = HYBRID.
   **Pass:** after clicking Assign, the row's status badge flips to `TEST_ASSIGNED` and the popover closes. **Fail:** row stays `APPLIED` or an error toast appears.

### Step 2 — Trainer dashboard CTA (this is what C3 added)
2.1. In the trainer browser context, reload `/en/trainer/dashboard`. **Pass:** the row for this application renders a `Take test` primary CTA with `data-testid="trainer-test-cta-<appId>"` and the helper line `A test has been assigned — take it to move forward.`. **Fail:** no CTA or it says "View result" (wrong branch).

**Adversarial check:** if we regressed to only rendering on a different status, or swapped the message keys, this step would show different text or no button. The broken implementation would not render the primary button with the exact "Take test" label.

### Step 3 — Trainer opens the test page (pre-start state)
3.1. Click the CTA. URL goes to `/en/trainer/applications/<appId>/test`. **Pass:** page renders `trainer-test-taker`, the header shows the test title, the chip `trainer-passing-hint` reads exactly `Passing hint: ≥ 60/100`, and the `trainer-test-ready` card with `trainer-test-start` button is visible. **Fail:** 404, redirect to login, or the "No test is assigned yet" empty state (`trainer-test-empty`).

**Adversarial check:** the fallback empty state exists in the same file, so if the backend `getAssignedTestForApplication` resolution had broken, this step would visibly land on `trainer-test-empty` instead — the two states are not interchangeable.

### Step 4 — Trainer starts + answers + submits
4.1. Click `trainer-test-start`. **Pass:** `trainer-test-form` appears, `trainer-test-ready` is gone, and two task blocks render: one `trainer-task-mcq-<id>` with 4 radio options and one `trainer-task-text-<id>` with a textarea. **Fail:** form does not render, stays on Ready card with an error (probable API failure), or shows a wrong task count.
4.2. Select the third MCQ option (label "Test", `trainer-task-<id>-opt-2`). **Pass:** the radio reflects as checked and no sibling in the group is selected (confirms the `name=answer-task-<id>` grouping). **Fail:** multiple radios selected at once or click has no effect.
4.3. Type `Ground generations in retrieved documents so the model cites evidence.` into the TEXT task textarea. **Pass:** textarea shows the text. **Fail:** input disabled or value doesn't persist.
4.4. Click `trainer-test-submit`. Accept the native confirm. **Pass:** UI flips to `trainer-test-result` with `data-status="SUBMITTED"` and the "Awaiting reviewer grading." line. The `trainer-total-score` element must NOT be present (grading not done yet, HYBRID without manual scoring = no totalScore). **Fail:** stays on the form, shows `trainer-test-error`, or already renders a totalScore.

**Adversarial check:** if submit silently dropped the responses (e.g. wrong endpoint, wrong payload shape), the server would still 400 and we'd see the error banner instead of the result card. If the post-submit refresh didn't work, we'd still see the form, not the result card.

### Step 5 — Company grades, trainer sees GRADED
5.1. As the company, open `/en/company/requests/<id>/applications/<appId>` (the applicant detail page with the Attempts card shipped in #19) and click into the attempt at `.../attempts/<attemptId>`. Grade both tasks to full marks (40 + 60 = 100). Add a reviewer note with the distinctive string `REVIEWER-ONLY-NOTE-<ts>`. Submit the grade. **Pass:** grading console shows "Graded" success. **Fail:** error toast.
5.2. Back in the trainer context, reload `/en/trainer/applications/<appId>/test`. **Pass:**
   - `trainer-test-result` has `data-status="GRADED"`.
   - `trainer-total-score` element renders and contains `100` (the i18n string resolves to `Final score: 100/100`).
   - The pass line renders (green/emerald "Above the company's passing hint…"), not the amber miss line.
   - The distinctive `REVIEWER-ONLY-NOTE-<ts>` string is NOT anywhere in the page DOM. **Fail (critical security bug):** the string appears anywhere in the page, or the dashboard CTA for this row reverts to primary "Take test" (would mean the status heuristic is inverted).

**Adversarial check (reviewerNotes leak):** the whole reason the backend strips `reviewerNotes` for non-owner callers is so this exact scenario does not leak. If we had regressed on `getAssignedTestForApplication` or `findAttempt`, the note would be rendered somewhere in the attempt payload and visible in the DOM. Searching for the exact marker string (instead of "reviewer") guarantees the assertion fails if any version of the note is rendered — including an accidental `JSON.stringify` of the full attempt object.

### Step 6 (regression, labeled so the reviewer skips) — Arabic RTL on the result page
6.1. Trainer clicks locale switcher to `ar`, reload same URL. **Pass:** `<html dir="rtl" lang="ar">`, the "Attempt submitted" title renders in Arabic (`تم تسليم المحاولة` per `ar.json`), the score line renders in Arabic numerals via i18n, and the layout is mirrored. **Fail:** English strings, dir=ltr, or missing keys (raw `trainer.tests.result.title` rendered).

## Out of scope for this run

- CODE task answering (deferred in this PR).
- AI grading, timers, chat, payments.
- Applications attachments UI.
- Company-side authoring UI regression (already proven by PR #19 testing).
- The passing-hint tooltip hover is visual-only; verifying CSS styling is not included.
- Full golden-flow regression (already gated by CI Playwright spec; we only spot-check Arabic on the result page).
