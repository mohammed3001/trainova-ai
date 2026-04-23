# Tier 2 — Evaluations / Tests UI — Spec

> Status: **draft — awaiting approval**
> Owners: company (author/reviewer), trainer (taker)
> Backend today: `apps/api/src/tests/*.ts` + `Test / TestTask / TestAttempt / TestTaskResponse` models in `packages/db/prisma/schema.prisma`.
> Frontend today: **zero** `/tests` routes exist. Only `messages/en.json:88` mentions `nav.myTests`. Nothing is wired.

---

## 1. Goal

Deliver a minimum shippable evaluations flow end-to-end:

1. A company owner can create a test for a job request, author MCQ + TEXT tasks, publish it.
2. The company can **assign** a specific applicant to take that test, moving the application into `TEST_ASSIGNED`.
3. The trainer sees the assignment in their dashboard, starts an attempt, answers, and submits.
4. Auto-gradable parts (MCQ with `answerKey`) are scored immediately.
5. The company reviewer grades manual tasks, writes notes, and sets `APPLICATION.status = TEST_SUBMITTED` → then can move to `ACCEPTED` / `REJECTED`.

Everything outside that path (CODE / LABEL / LIVE_PROMPT / WORKFLOW task types, timed enforcement, anti-cheat, per-question time limits, rubric builder UI) is explicitly deferred — captured in §10.

---

## 2. What already exists (grounding audit)

### 2.1 Backend
- `TestsService.findOne(id)` — **currently unauthenticated**, returns the test with tasks. `select` correctly excludes `answerKey` and `rubric`, so no answer leak — but anyone with an id can see the questions. The UI spec assumes this will be tightened to "trainer with a live attempt OR company owner".
- `TestsService.startAttempt(trainerId, testId, applicationId?)` — creates a `TestAttempt` in `IN_PROGRESS`. Does **not** check that the trainer actually has an application against the test's request, or that the application is in `TEST_ASSIGNED`.
- `TestsService.submitAttempt(trainerId, attemptId, responses[])` — auto-grades MCQ, writes `TestTaskResponse` rows, sets `status=SUBMITTED`, computes `autoPercent`, stores `totalScore=null` when any task needs manual grading (fixed in PR #1).
- `TestsService.listAttemptsForTrainer(trainerId)` — trainer's own attempts.
- **Missing**: company authoring (create/update/delete test + tasks), manual-grading endpoint, attempt listing for company/request, application-level "assign test" transition hook, ownership checks on `findOne`/`startAttempt`.

### 2.2 Schema (no changes needed for MVP)
- `Test { id, requestId?, title, description?, timeLimitMin?, passingScore, scoringMode: AUTO|MANUAL|HYBRID }`
- `TestTask { id, testId, prompt, type, options[], answerKey?, maxScore, rubric?, order }`
- `TestAttempt { id, testId, applicationId?, trainerId, startedAt, submittedAt?, status: IN_PROGRESS|SUBMITTED|GRADED|EXPIRED, totalScore?, scoreBreakdown?, durationSec?, reviewerNotes? }`
- `TestTaskResponse { attemptId, taskId, response, autoScore?, manualScore?, comments? } @@unique([attemptId, taskId])`

All fields the MVP needs already exist. No migration.

### 2.3 Application status machine
- Enum already has `TEST_ASSIGNED` and `TEST_SUBMITTED`. They are currently **terminal with no outgoing transitions** in `APPLICATION_STATUS_TRANSITIONS` (`packages/shared/src/enums.ts:41-54`). That's a pure data edit, no schema change.
- Proposed transition diff (data-only, `packages/shared/src/enums.ts`):
  ```ts
  APPLIED:        ['SHORTLISTED', 'TEST_ASSIGNED', 'ACCEPTED', 'REJECTED'],
  SHORTLISTED:    ['APPLIED', 'TEST_ASSIGNED', 'ACCEPTED', 'REJECTED'],
  TEST_ASSIGNED:  ['TEST_SUBMITTED', 'REJECTED', 'WITHDRAWN'],   // TEST_SUBMITTED on trainer submit
  TEST_SUBMITTED: ['ACCEPTED', 'REJECTED'],                       // after manual review
  ```
- `TEST_ASSIGNED → TEST_SUBMITTED` is the one transition **performed by the trainer's submit**, not the company. Everywhere else remains company-owned.

---

## 3. Flows

### 3.1 Company — authoring
Route `…/company/requests/[id]/tests` (list) and `…/company/requests/[id]/tests/[testId]/edit` (editor).

1. From the request detail page, company owner clicks **Add test**. A dialog asks for title, `scoringMode` (default HYBRID), optional description and `timeLimitMin`, `passingScore` (default 60).
2. Test created in draft-equivalent state. (We do not add a `published` column for MVP — a test is "usable" as soon as it has ≥ 1 task.)
3. Editor shows a sortable task list (visual only, no drag-sort in MVP — plus/minus order arrows). Each task row:
   - `type`: MCQ | TEXT (other types hidden behind a "coming soon" marker).
   - `prompt` (textarea, required).
   - MCQ: `options[]` with +/- controls, `answerKey` must match one option.
   - TEXT: `rubric` free-text (persisted into the JSON `rubric` as `{ hint: string }`).
   - `maxScore` (int, default 10).
4. Save button persists everything in one request (see §4.1).

### 3.2 Company — assigning
From `…/company/requests/[id]/applications/[appId]` (detail page that already exists), a new **Assign test** button appears when `status ∈ {APPLIED, SHORTLISTED}` and at least one test exists for the request.

- Clicking opens a tiny `<select>` of tests for this request, submits to `POST /applications/:appId/assign-test`.
- Server wraps in a transaction: atomic claim like `updateStatus`, creates nothing new (no need — the trainer's own attempt is lazily created when they click Start), writes an `AuditLog` row with `action='APPLICATION_TEST_ASSIGNED'`, `diff={ testId }`.
- Sends email `test-assigned.{en,ar}.hbs` to the trainer with a link to `/trainer/tests/[attemptOrTestId]`.

### 3.3 Trainer — taking
Route `…/trainer/tests` (list of assigned + in-progress + submitted) and `…/trainer/tests/[testId]/take/[applicationId]`.

- List shows each application where the trainer's `status` is `TEST_ASSIGNED` or later with a link to either **Start test**, **Resume**, or **View result**.
- Taking page:
  1. `POST /tests/:id/attempts` with `applicationId` → returns attempt id (server idempotent: if an `IN_PROGRESS` attempt already exists for (trainerId, testId, applicationId), return it).
  2. Renders one task per screen OR a single scrollable form. MVP = single scrollable form (simpler, fewer network round trips).
  3. Responses are held in React state. A client-side timer counts down against `timeLimitMin` if set — purely informational in MVP (no server-side auto-expire; that's in §10).
  4. **Submit** → `POST /tests/attempts/:attemptId/submit` with `{ responses: [{ taskId, response }] }`.
     - Server auto-grades MCQ, stores responses, sets `TestAttempt.status=SUBMITTED`.
     - Server also applies `Application.status: TEST_ASSIGNED → TEST_SUBMITTED` in the same transaction (one concurrent application updated via `updateMany where status=TEST_ASSIGNED`), writes `AuditLog action='APPLICATION_TEST_SUBMITTED'`.
  5. Trainer is redirected to a result screen: auto score, which tasks need manual review, pass/fail hint (only if `scoringMode=AUTO` and `autoPercent >= passingScore`; otherwise "Pending review").

### 3.4 Company — reviewing / grading
Route `…/company/requests/[id]/applications/[appId]/test/[attemptId]`.

- Only visible when `attempt.status ∈ {SUBMITTED, GRADED}`.
- Shows each task, the trainer's response, the auto score (if any), and for manual tasks an input `manualScore` (0…maxScore) + `comments` textarea.
- A single **Save grades** button persists all manual scores via `POST /tests/attempts/:attemptId/grade` with `{ grades: [{ taskId, manualScore, comments }], reviewerNotes? }`.
  - Server recomputes `totalScore = (auto + manual) / maxTotal * 100` rounded, sets `TestAttempt.status=GRADED`, writes audit `TEST_ATTEMPT_GRADED` with `diff={ totalScore, passingScore }`.
- Panel below shows pass/fail against `test.passingScore` and a shortcut button set reusing the existing `StatusControls` component to move the application to `ACCEPTED` / `REJECTED`.

---

## 4. API surface

> "+" = new. "~" = modified.

| Method | Path | Role | Purpose |
|---|---|---|---|
| + `POST` | `/tests` | COMPANY | Create a test `{ requestId, title, description?, timeLimitMin?, passingScore?, scoringMode?, tasks: [...] }`. Returns test with tasks. |
| + `PATCH` | `/tests/:id` | COMPANY | Update test metadata and replace the task set (see §4.1). |
| + `DELETE` | `/tests/:id` | COMPANY | Deletes test and cascades tasks/attempts. Only allowed when **no attempts exist** (else 409). |
| + `GET`  | `/tests/request/:requestId` | COMPANY | List tests for a request (owner-scoped). |
| ~ `GET`  | `/tests/:id` | COMPANY or TRAINER-with-attempt | Ownership check added. Trainer only gets it if an `IN_PROGRESS` or `SUBMITTED` attempt of theirs exists for this test. Still never returns `answerKey`/`rubric`. |
| ~ `POST` | `/tests/:id/attempts` | TRAINER | Idempotent per (trainer, test, application). Requires `application.status ∈ {TEST_ASSIGNED}` and ownership of the application. Returns attempt. |
| ~ `POST` | `/tests/attempts/:attemptId/submit` | TRAINER | Existing logic plus: transactional `Application.status: TEST_ASSIGNED → TEST_SUBMITTED` with audit. |
| + `POST` | `/tests/attempts/:attemptId/grade` | COMPANY | Body `{ grades: [{taskId, manualScore, comments?}], reviewerNotes? }`. Transactional. Writes `TEST_ATTEMPT_GRADED` audit. Sets `status=GRADED`, computes `totalScore`. |
| + `GET`  | `/tests/attempts/:attemptId` | COMPANY or TRAINER-owner | Full attempt payload for reviewer or post-submit trainer view. Hides `answerKey`/`rubric` from trainer. |
| + `GET`  | `/applications/:appId/attempts` | COMPANY or TRAINER-owner | List attempts for this application (trivial; helps UI avoid guessing attempt ids). |
| + `POST` | `/applications/:appId/assign-test` | COMPANY | Body `{ testId }`. Validates test belongs to the same request. Atomic `Application.status: APPLIED|SHORTLISTED → TEST_ASSIGNED`. Writes audit `APPLICATION_TEST_ASSIGNED`. Sends email. |

### 4.1 PATCH /tests/:id semantics
Simplest sane shape: body is `{ title?, description?, timeLimitMin?, passingScore?, scoringMode?, tasks?: TestTaskInput[] }`.
- If `tasks` is provided, the server does a **diff-based replace**:
  - Insert rows that lack an id.
  - Update rows whose id matches an existing row.
  - Delete rows that exist in DB but not in payload — **only if no `TestTaskResponse` rows reference them**; otherwise 409 `TEST_TASK_HAS_RESPONSES`.
- Not great long-term but it's the minimum viable editor for MVP and keeps the frontend a pure controlled form.

### 4.2 All company writes
- Guarded by `JwtAuthGuard + RolesGuard(COMPANY)` **and** a per-service check that `test.request.company.ownerId === user.id` (same pattern as `ApplicationsService.updateStatus`).
- Validated via existing `ZodValidationPipe`. Zod schemas live in `packages/shared/src/schemas/tests.ts` (new file) and are re-exported from `@trainova/shared`.

---

## 5. Scoring behavior

- **Auto (MCQ)**: `autoScore = (response === task.answerKey) ? task.maxScore : 0`. Exact string match, current behavior retained.
- **Manual (TEXT)**: reviewer enters `manualScore ∈ [0, maxScore]`, server clamps.
- **Total**:
  - Let `S_auto = Σ autoScore` (only tasks with autoScore not null).
  - Let `S_manual = Σ manualScore` (only tasks graded).
  - Let `M = Σ maxScore` over all tasks in the attempt's test **at grade time** (handles the edge where tasks were added after the attempt — we ignore those for scoring fairness; see §7).
  - `totalScore = round((S_auto + S_manual) / M * 100)`.
- `scoreBreakdown` JSON retained and extended: `{ autoTotal, autoMax, manualTotal, manualMax, totalScore, max, requiresManualGrading }`.
- Pass/fail is UI-only: `totalScore >= test.passingScore`.

### 5.1 Submit while some tasks unanswered
- Allowed. Unanswered tasks score 0 against `maxScore`. The submit UI warns "You have N unanswered questions — submit anyway?".

### 5.2 Changing a test mid-flight
- If a company edits the test while an attempt is `IN_PROGRESS`, the attempt **retains its original task snapshot** via the existing `TestTaskResponse` rows — the grader UI fetches the task set of the test but scores only against tasks the trainer actually saw (matched by id). We rely on tasks not being deleted when responses exist (see §4.1). Deferred: full snapshot on attempt start.

---

## 6. Manual review behavior

- Triggered by the company opening `…/applications/[appId]/test/[attemptId]`.
- Form is client-side controlled. A single save persists all grades atomically.
- Writing `TEST_ATTEMPT_GRADED` audit with `diff={ totalScore, passingScore, reviewerNotes? }` gives us a history trail.
- **Re-grading** is allowed on `GRADED` attempts (same endpoint, idempotent, writes a new audit row each time).

---

## 7. Application status integration

| Trigger | From | To | Actor | Where |
|---|---|---|---|---|
| Company clicks **Assign test** | `APPLIED`/`SHORTLISTED` | `TEST_ASSIGNED` | company owner | `POST /applications/:id/assign-test` |
| Trainer submits attempt | `TEST_ASSIGNED` | `TEST_SUBMITTED` | trainer | inside `submitAttempt` transaction |
| Company Accept / Reject after grading | `TEST_SUBMITTED` | `ACCEPTED` / `REJECTED` | company owner | existing `PATCH /applications/:id/status` |

All three use the same `updateMany`-with-`where: status=<from>` lost-update guard pattern as `ApplicationsService.updateStatus`.

---

## 8. Required routes / pages (web)

| Path | Role | Notes |
|---|---|---|
| `/[locale]/company/requests/[id]/tests` | COMPANY | List + "Add test" button. |
| `/[locale]/company/requests/[id]/tests/[testId]/edit` | COMPANY | Test metadata + tasks editor. |
| `/[locale]/company/requests/[id]/applications/[appId]` | COMPANY | **Extend** existing page with `Assign test` button + "Tests" tab listing attempts. |
| `/[locale]/company/requests/[id]/applications/[appId]/test/[attemptId]` | COMPANY | Reviewer grading view. |
| `/[locale]/trainer/tests` | TRAINER | List of assignments + submissions. New page. Also linked from `nav.myTests` (already in i18n). |
| `/[locale]/trainer/tests/[testId]/take/[applicationId]` | TRAINER | Taking form. |
| `/[locale]/trainer/tests/[testId]/result/[attemptId]` | TRAINER | Post-submit result screen. |

All pages are server components that fetch via the existing `/api/proxy/*` layer and render a client island for form state where needed. RTL handled by the existing `<html dir>` switch.

---

## 9. API gaps vs what we ship

| Feature | Gap | Plan |
|---|---|---|
| `POST /tests` | ❌ doesn't exist | New. |
| `PATCH /tests/:id` | ❌ doesn't exist | New. Replace-set semantics §4.1. |
| `DELETE /tests/:id` | ❌ doesn't exist | New. 409 if attempts exist. |
| `/tests/request/:rid` listing | ❌ doesn't exist | New. |
| `GET /tests/:id` auth | 🟡 unauthenticated | Tighten to owner/attempt-holder. |
| `POST /tests/:id/attempts` guards | 🟡 missing ownership | Add: trainer must own application in `TEST_ASSIGNED`. Idempotent. |
| `POST /tests/attempts/:aid/submit` | 🟡 no App.status write | Wrap in transaction, write `TEST_SUBMITTED`. |
| `POST /tests/attempts/:aid/grade` | ❌ doesn't exist | New. |
| `GET /tests/attempts/:aid` | ❌ doesn't exist | New. |
| `POST /applications/:id/assign-test` | ❌ doesn't exist | New. Atomic status claim. |
| Transition matrix | 🟡 TEST_* terminal | Data-only edit in `packages/shared/src/enums.ts`. |
| Audit actions | 🟡 only APPLICATION_STATUS_CHANGED etc | Add `APPLICATION_TEST_ASSIGNED`, `APPLICATION_TEST_SUBMITTED`, `TEST_ATTEMPT_GRADED` to `AUDIT_ACTIONS`. |
| Emails | 🟡 no test templates | Add `test-assigned.{en,ar}.hbs` (subject + body + CTA). Reuse existing Resend abstraction from PR #7. |
| Zod schemas | ❌ none | Add in `packages/shared/src/schemas/tests.ts`. |
| Swagger tags | 🟡 only `tests` tag | Keep. Document all new endpoints. |

---

## 10. Playwright coverage updates

Extend the golden regression with a new spec `evaluations.spec.ts` (separate file so failures isolate). Seeded data already contains a HYBRID test for the demo request, so the flow works on a fresh CI DB after migrations + seed.

Golden evaluations sub-flow (single Playwright test, ≈ 8 steps):

1. Log in as demo company owner → go to request detail → **Add test** → add 1 MCQ + 1 TEXT → Save.
2. From the same request's applications page → click an `APPLIED` applicant → **Assign test** → pick the just-created test → assert badge flips to `TEST_ASSIGNED`.
3. Log out, log in as demo trainer → `/trainer/tests` shows 1 assignment → **Start**.
4. Answer MCQ correctly + fill TEXT → **Submit**.
5. Result screen shows auto score, "Pending review" badge.
6. Log out, log back in as company → open applications → badge is `TEST_SUBMITTED` → open reviewer screen → grade TEXT 15/20 → Save.
7. Assert `totalScore` ≥ `passingScore` → click **Accept** → badge flips to `ACCEPTED`.
8. API check: `GET /applications/:id/history` includes `APPLICATION_TEST_ASSIGNED`, `APPLICATION_TEST_SUBMITTED`, `APPLICATION_STATUS_CHANGED` rows in the right order.

**No change** to the existing `golden.spec.ts` other than adding `evaluations` and `tests` to the expected-Swagger-tags list (already present as `tests`). The existing T-steps keep passing because the transition matrix only *adds* allowed transitions — existing ones are unchanged.

---

## 11. PR plan (proposed)

Split Tier 2 evaluations into **three** PRs to keep review surface small, per your pattern:

- **PR C1 — evaluations backend**
  - Extend transition matrix.
  - New endpoints (§4), new Zod schemas, new audit actions, ownership checks.
  - Email template stubs (`test-assigned.{en,ar}.hbs`) wired to Resend.
  - No UI.
  - Existing Playwright golden flow must still pass.
- **PR C2 — evaluations UI (company side)**
  - Test list + editor pages, assign-test control, reviewer grading page.
  - i18n under `tests.*` (company-facing copy) AR/EN.
- **PR C3 — evaluations UI (trainer side) + Playwright evaluations spec**
  - `/trainer/tests`, taking form, result page.
  - New Playwright spec `evaluations.spec.ts` (§10) gating CI.
  - i18n under `tests.*` (trainer-facing copy) AR/EN.

C1 is safe to merge alone (no UI consumers yet). C2 depends on C1. C3 depends on C2.

---

## 12. Out of scope (for this cycle)

- Timed server-side enforcement (`status=EXPIRED` cron on `startedAt + timeLimitMin`).
- Anti-cheat (tab focus tracking, paste guard, proctoring, randomized option order per attempt).
- Task types beyond MCQ + TEXT (CODE, LABEL, PROMPT_TUNE, LIVE_PROMPT, WORKFLOW). Schema already supports them — we just don't author or render them.
- Rubric-builder UI for manual grading (we store `rubric` as free-text hint only).
- Per-question manual scores with weighted rubric categories.
- Attempt snapshots (we rely on "no delete when responses exist" instead).
- Bulk test assignment (multiple trainers at once).
- Test versioning.
- Drag-sort task ordering.
- Trainer retake policy.

---

## 13. Open questions for @mohammed3001

1. **MVP task types** — ship `MCQ + TEXT` only, or include `CODE` as a monospaced textarea (no runner, still manually graded)?
2. **Retake policy** — if an attempt is `SUBMITTED` or `GRADED`, do we (a) allow the company to re-assign the same test (creates a new attempt), (b) block re-assignment, or (c) allow the trainer to retake before grading? MVP recommendation: (b).
3. **Test visibility after publish** — are tests per-request only (current assumption, matches `requestId` column), or do we want a company-wide test library reusable across requests (would need denormalization / copy-on-assign)? MVP recommendation: per-request only.
4. **Reviewer notes privacy** — `TestAttempt.reviewerNotes` is currently always returned by the grading view. Should the trainer's result page ever see those? MVP recommendation: **no**, notes are company-internal.
5. **Passing-score semantics** — is `passingScore` (default 60) a **gate** (below = auto-reject) or a **hint** (reviewer still decides)? MVP recommendation: hint only; final decision is the company's explicit `ACCEPT/REJECT`.

Once these are answered I'll open **PR C1 — evaluations backend** as the first slice.
