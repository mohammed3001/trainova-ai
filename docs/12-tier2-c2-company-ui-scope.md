# Tier 2 — PR C2 Scope: Company-side Evaluations UI

**Status:** Draft, awaiting approval
**Depends on:** PR #17 (evaluations backend), PR #18 (follow-up fixes)
**Follows:** PR C3 (trainer UI + Playwright coverage) — out of scope here

This document scopes **only** the company-facing web UI for evaluations. Trainer-side
test-taking UI and Playwright coverage land in PR C3. The spec lives at
[`docs/11-tier2-evaluations-spec.md`](./11-tier2-evaluations-spec.md); locked decisions
(MCQ + TEXT + CODE, block re-assign after submit, per-request tests, hidden reviewer
notes, hint-only passing score) are assumed.

---

## 1. Goal

Give a company owner, for a request they own, everything needed to:

1. Author tests (list / create / edit / delete).
2. Assign a test to an applicant from the applications list.
3. See submitted attempts and grade the TEXT/CODE responses.

All backend endpoints are already shipped in #17, so this PR is strictly UI wiring.

---

## 2. What already exists (no changes)

| File | Role | Change in C2? |
|---|---|---|
| `apps/web/src/app/[locale]/company/dashboard/page.tsx` | Lists the company's requests | No |
| `apps/web/src/app/[locale]/company/requests/new/page.tsx` | New-request form | No |
| `apps/web/src/app/[locale]/company/requests/[id]/applications/page.tsx` | Applicants list + status controls (Tier 1.D) | Yes — add **Assign test** action + show `TEST_ASSIGNED` / `TEST_SUBMITTED` badges link through to the grading console |
| `apps/web/src/app/[locale]/company/requests/[id]/applications/status-controls.tsx` | Status-badge + per-row action client component | Minor — extend `MVP_ACTIONABLE` to include the test flow; the button itself lives in a new `AssignTestButton` sibling to keep the restricted-targets guard intact |
| `apps/web/src/app/[locale]/company/requests/[id]/applications/[appId]/page.tsx` | Applicant detail + history | Yes — add an "Attempts" card linking to grading console when the application is in `TEST_SUBMITTED` / `GRADED` |

---

## 3. New routes

| Path | Role | Auth |
|---|---|---|
| `/[locale]/company/requests/[id]/tests` | Tests list for a request — cards with title, task count, attempt count, edit/delete buttons, **+ New test** CTA | `COMPANY_OWNER`, must own request |
| `/[locale]/company/requests/[id]/tests/new` | Editor in create mode | same |
| `/[locale]/company/requests/[id]/tests/[testId]/edit` | Editor in edit mode | same |
| `/[locale]/company/requests/[id]/applications/[appId]/attempts/[attemptId]` | Grading console for a single attempt — read-only task prompts, trainer responses, per-task score input, `reviewerNotes` textarea, **Submit grades** | same |

The request detail index (`/[locale]/company/requests/[id]`) still redirects to
`/applications` as today — tests live one level deeper so the existing applicants
flow is unchanged for users who never open a test.

---

## 4. New components

All client components unless marked (server).

1. **`TestsList`** (server) — renders the cards returned by `GET /tests?requestId=`.
2. **`TestEditor`** (client) — controlled form, reused by both `new` and `edit`:
   - Fields: `title`, `description` (textarea), `timeLimitMin` (optional number), `passingScore` (number with hint-only copy), `scoringMode` (select: AUTO / MANUAL / HYBRID).
   - Tasks: array editor with per-task `type` (MCQ / TEXT / CODE), `prompt`, `maxScore`, `order` (drag-to-reorder out of scope for C2 — use a `up/down` button or numeric `order` input), MCQ-specific `options[]` and `answerKey`, rubric `hint`.
   - Client-side validation mirrors `testTaskInputSchema` (MCQ needs ≥ 2 options + answerKey ∈ options). Server-side Zod is the source of truth; the client just prevents the obvious submit.
   - Submit posts to `POST /tests` or `PATCH /tests/:id` via `fetch` to `/api/proxy/...`; on success `router.refresh()` + navigate back to the tests list.
3. **`AssignTestButton`** (client) — appears in `StatusActions` when `currentStatus ∈ {APPLIED, SHORTLISTED}`. Opens a small popover listing the request's tests (via `GET /tests?requestId=`), one "Assign" button per row. `POST /applications/:id/assign-test` with `{ testId }`. Success flips the application row to `TEST_ASSIGNED` and shows "Email sent to trainer".
4. **`AttemptsCard`** (server) — on the application detail page. Calls a new backend view or reuses the existing service method `listAttemptsForApplication` (already in `TestsService`, just needs a controller route — see §5). Shows each attempt's status + totalScore + link to grading console.
5. **`GradingConsole`** (client) — form mirroring `gradeAttemptSchema`:
   - Per task row: show prompt (read-only), trainer response, MCQ auto-score (if applicable) as a read-only chip, number input for `manualScore` clamped `0..task.maxScore`, textarea for per-task `comments` (≤ 2000).
   - Global `reviewerNotes` textarea (≤ 4000).
   - Submit posts `POST /tests/attempts/:attemptId/grade`. On success shows the recomputed `totalScore` and the new `status` badge (`GRADED`).

---

## 5. Backend touch (small)

PR #17 shipped `TestsService.listAttemptsForApplication` but no controller route for
it. C2 adds one thin endpoint so the `AttemptsCard` doesn't have to scrape via the
attempt detail route:

```
GET /applications/:id/attempts  → company-owner or admin only
                               → [{ id, status, totalScore, submittedAt, test: {id, title} }]
```

No schema change, no new service logic. If you'd rather keep C2 100% frontend,
we can instead fetch `/tests?requestId=` and derive the attempts per-application
on the client — I'll default to the new endpoint because it's one line in the
controller and avoids an N+1.

---

## 6. API calls summary

All go through the existing `/api/proxy/[...path]` route, so the JWT cookie is
forwarded automatically and no new auth plumbing is needed.

| Page / component | Method | Path |
|---|---|---|
| Tests list | GET | `/tests?requestId=…` |
| New / Edit editor | POST / PATCH | `/tests` / `/tests/:id` |
| Tests list delete | DELETE | `/tests/:id` (409 if attempts exist — toast) |
| Assign test button | POST | `/applications/:id/assign-test` |
| Attempts card | GET | `/applications/:id/attempts` (new thin endpoint, §5) |
| Grading console load | GET | `/tests/attempts/:attemptId` |
| Grading console submit | POST | `/tests/attempts/:attemptId/grade` |

---

## 7. i18n keys (new)

Added under `company.tests.*` and `company.tests.grading.*`, both `en.json` and
`ar.json`. Rough shape:

```
company.tests
  title                          — "Tests"
  empty                          — "No tests yet."
  new                            — "New test"
  editor.title.create             — "New test"
  editor.title.edit               — "Edit test"
  editor.fields.title             — "Title"
  editor.fields.description       — "Description"
  editor.fields.timeLimitMin      — "Time limit (minutes)"
  editor.fields.passingScore      — "Passing score (hint only — you still decide)"
  editor.fields.scoringMode       — "Scoring mode"
  editor.tasks.heading            — "Tasks"
  editor.tasks.addMcq             — "Add MCQ task"
  editor.tasks.addText            — "Add text task"
  editor.tasks.addCode            — "Add code task"
  editor.tasks.prompt             — "Prompt"
  editor.tasks.options            — "Options"
  editor.tasks.answerKey          — "Correct answer"
  editor.tasks.rubricHint         — "Grading hint for reviewers (not shown to trainer)"
  editor.tasks.maxScore           — "Max score"
  editor.tasks.remove             — "Remove task"
  editor.errors.mcqNeedsOptions   — "MCQ tasks need at least 2 options and a correct answer."
  assign.button                   — "Assign test"
  assign.popover.title            — "Pick a test to assign"
  assign.popover.empty            — "No tests authored yet — create one first."
  assign.success                  — "Test assigned. The trainer has been notified by email."
  attempts.title                  — "Test attempts"
  attempts.empty                  — "No attempts yet."
  attempts.status.inProgress      — "In progress"
  attempts.status.submitted       — "Submitted — awaiting grading"
  attempts.status.graded          — "Graded"
  grading.title                   — "Grade attempt"
  grading.task.auto               — "Auto-scored ({score}/{max})"
  grading.task.manual             — "Manual score (0–{max})"
  grading.task.comments           — "Comments for the trainer (optional)"
  grading.reviewerNotes           — "Internal reviewer notes (not shown to the trainer)"
  grading.submit                  — "Submit grades"
  grading.result.title            — "Grading recorded"
  grading.result.total            — "Total score: {score}/100"
```

Arabic copy mirrors English with existing tone (Tier 1.D precedent).

---

## 8. Explicitly NOT in C2

- Any trainer-side UI (test-taking, attempt in-progress surface) — PR C3.
- Playwright changes — PR C3 extends the golden flow with a test-assign → submit → grade leg.
- Drag-to-reorder task UI — numeric `order` input is sufficient; can ship as a polish PR later.
- In-editor preview of the MCQ as-seen-by-trainer — PR C3 will ship the real trainer page.
- Company-wide test library / templates — locked out for the MVP.
- Bulk-grade or inline-grade from the applications list — grading lives only on the detail console.
- Code runner for CODE tasks — stays manual graded.
- Time-limit enforcement (there is no backend cron in C1); the editor still exposes the field because the trainer page will display it in C3.

---

## 9. Risks / edge cases called out

- **Assign-test race**: two company owners assigning simultaneously both land on the backend's `updateMany where status=APPLIED|SHORTLISTED` atomic claim. The loser gets a 400; UI renders the error and offers a reload.
- **Delete-test with attempts**: backend returns 409 with `code: "TEST_HAS_ATTEMPTS"`. UI catches that code and shows a non-destructive toast; no disabled-state heuristic on the list (which could lie if attempts show up after render).
- **Partial grading**: the backend recomputes the total from persisted rows on every grade call, so a partial save-and-come-back workflow is safe. UI in C2 submits all-at-once; a resumable partial-grade UX is a later polish.
- **Hidden fields**: `answerKey` and `rubric` are never in any `GET` payload the trainer receives; the grading console uses the company/admin-view payload from `GET /tests/attempts/:attemptId` which includes them. The editor can read `GET /tests/:id` (same payload) to seed edits.

---

## 10. Rough scope estimate

Single PR, backend + frontend but weighted toward frontend:

- ~1 thin backend route (`GET /applications/:id/attempts`).
- 4 new pages + 1 edit of the applications list + 1 edit of the applicant detail.
- ~5 new components (list, editor, assign-button, attempts-card, grading-console).
- 2 i18n files updated.

No schema change, no migration, no new env var.

---

## 11. Open questions (confirm before I open the PR)

1. **New backend route** (`GET /applications/:id/attempts`) — OK to add it in this PR, or do you want C2 kept 100% frontend and I derive attempts another way?
2. **MCQ editor UX** — inline "type to add an option" list (current proposal), or a fixed 4-option grid? I'd go with dynamic so TEXT/CODE stays symmetric.
3. **Attempt detail location** — nest the grading console under the applicant (`.../applications/[appId]/attempts/[attemptId]`, current proposal, keeps breadcrumbs natural), or put it under the test (`.../tests/[testId]/attempts/[attemptId]`, closer to test ownership)?
4. **Delete guard** — when backend 409s on test delete because attempts exist, should the UI offer an **archive** affordance instead, or just leave the test visible and rely on the company owner not assigning it again? C2 default: just toast and leave the test visible; archiving is its own feature.
5. **Passing-score display on the grading console** — show the hint as a sidecar chip ("hint: ≥ 60 passes") or hide it in the company-facing surface since the decision is manual anyway? C2 default: sidecar chip so the authored intent is visible.
