# Tier 1.D — Company-side application status update UI + audit entry (spec)

Scope: let a company owner move an `Application` through a curated status
subset from the UI, and persist a tamper-evident audit trail. No schema
changes (the `AuditLog` model is already in place, see `schema.prisma:97`).

Keep the PR isolated — no Tier 1.E items (profile polish, uploads).

## 1. State machine

The full `ApplicationStatus` enum in `packages/shared/src/enums.ts` already
has 9 values. The MVP UI intentionally exposes only 4 of them so reviewers
have a clear, linear flow; the other 5 stay in the enum for later milestones
(test assignment, interview, offer, withdrawal).

```
                 ┌──────────────┐
 (trainer apply) │   APPLIED    │  ← initial
                 └──────┬───────┘
                        │ Shortlist
                        ▼
                 ┌──────────────┐
                 │ SHORTLISTED  │  ← "in review" in the UI copy
                 └──┬────────┬──┘
              Accept│        │Reject
                    ▼        ▼
          ┌──────────┐  ┌──────────┐
          │ ACCEPTED │  │ REJECTED │  ← terminal (no further transitions)
          └──────────┘  └──────────┘
```

Transition matrix (what the company UI can do):

| From \ To   | APPLIED  | SHORTLISTED | ACCEPTED | REJECTED |
| ----------- | :------: | :---------: | :------: | :------: |
| APPLIED     |     –    |      ✅     |     ✅    |    ✅    |
| SHORTLISTED |     ✅   |      –      |     ✅    |    ✅    |
| ACCEPTED    |     –    |      –      |     –    |    –    |
| REJECTED    |     –    |      –      |     –    |    –    |

- `ACCEPTED` and `REJECTED` are terminal. To "undo" a terminal status the
  owner must request support (out of scope for the MVP).
- `WITHDRAWN` is trainer-initiated and stays deferred.
- Values already in the enum but hidden from the MVP UI
  (`TEST_ASSIGNED`, `TEST_SUBMITTED`, `INTERVIEW`, `OFFERED`) are still
  accepted by the API for future milestones — the UI just doesn't render
  buttons for them yet.

User's spec quoted `APPLIED → IN_REVIEW → ACCEPTED → REJECTED`. `IN_REVIEW`
is not an `ApplicationStatus` — it's a `JobRequest` status. Mapping the
user-facing label **"In review"** to the existing enum value `SHORTLISTED`
keeps the DB schema unchanged; the UI copy simply reads "In review". Open
question for reviewer: ok to proceed with this label mapping, or should we
add a new `IN_REVIEW` application status? (Schema change either way is
trivial; doing it now would bloat this PR, doing it later is backwards-
compatible.)

## 2. API surface

### 2.1 Existing — to be extended

```
PATCH /api/applications/:id/status
Auth: Bearer token with role COMPANY_OWNER
Owns: request.company.ownerId === user.id (enforced today at
      applications.service.ts:57)
Body: { status: ApplicationStatus, note?: string }   // note is new
```

Changes vs today:

1. Wrap the update in a `$transaction(async tx => …)` with an `updateMany`
   that claims the row only if `status = <fromStatus>` matches the current
   one — closes the race where two concurrent PATCHes produce inconsistent
   history (same TOCTOU pattern as PR #10).
2. Reject transitions that violate the matrix above (from terminal states,
   or from `APPLIED` directly to `APPLIED`, etc.) with `400 Invalid
   transition`.
3. Write an `AuditLog` row **in the same transaction** so status change and
   audit trail either both land or both roll back.
4. Accept an optional `note` (≤ 500 chars) captured into `AuditLog.diff`.

Response: the updated `Application` row (unchanged shape — UI already
consumes this).

### 2.2 New

```
GET /api/applications/:id/history
Auth: Bearer token. Allowed if either:
  - user owns the application's company, or
  - user is the trainer who applied (so trainers can see status changes
    with reasoning, when enabled)
Returns: [{
  id, action, fromStatus, toStatus, note, actorId, actorName, createdAt
}]
Ordered newest-first.
```

This is read-only and thin: one query on `AuditLog` filtered by
`entityType='Application' AND entityId=:id`.

### 2.3 Rate limiting (reuses Tier 1.C global default)

`PATCH .../status` falls under the global 120/min/IP bucket — no per-route
override. If a company spams status updates we want them visible in
AuditLog, not 429'd.

## 3. Audit log structure

Existing shape (`packages/db/prisma/schema.prisma:97`):

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  actorId    String?          // who performed the action
  actor      User?    @relation(...)
  action     String           // e.g. "APPLICATION_STATUS_CHANGED"
  entityType String           // "Application"
  entityId   String           // the application id
  diff       Json?            // see below
  ip         String?          // captured from request
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
  @@index([actorId])
}
```

**`diff` payload for this PR**:

```json
{
  "fromStatus": "APPLIED",
  "toStatus":   "SHORTLISTED",
  "note":       "Strong portfolio, inviting to a short interview.",
  "userAgent":  "Mozilla/5.0 ...",
  "locale":     "en"
}
```

- `action = "APPLICATION_STATUS_CHANGED"` (one string constant, kept in
  `packages/shared` so UI and API agree).
- `entityType = "Application"`.
- `entityId` is the application id.
- `actorId` is the company-owner user id. `SetNull` on user delete keeps
  history after account removal.
- `ip` comes from `req.ip` (best-effort; once we're behind a load balancer
  we'll need trusted proxy headers — tracked in the Tier 1.C out-of-scope
  list).
- `note` is optional and stored inside `diff` so we don't bloat the schema
  for an MVP-only field.

### What gets recorded

| When                            | action                           | diff.fromStatus | diff.toStatus |
| ------------------------------- | -------------------------------- | :-------------: | :-----------: |
| Owner moves status (MVP)        | `APPLICATION_STATUS_CHANGED`     |     current     |      new      |
| Trainer first applies (later)   | `APPLICATION_SUBMITTED`          |       –         |   `APPLIED`   |
| Trainer withdraws (later)       | `APPLICATION_WITHDRAWN`          |     current     |  `WITHDRAWN`  |

Only row 1 ships in this PR; rows 2/3 are listed so the action names don't
collide later.

### What gets NOT recorded

- Reads of the application / history list (would balloon the table).
- PATCHes with no actual status change (e.g. client submits the same
  status again) — short-circuit before writing an audit row.

## 4. UI

### 4.1 File: `apps/web/src/app/[locale]/company/requests/[id]/applications/page.tsx`

Already lists applications (verified in T6 of the golden E2E). We'll add,
per row:

- A status badge with colour mapping:
  - `APPLIED` — slate
  - `SHORTLISTED` — amber ("In review" label)
  - `ACCEPTED` — emerald
  - `REJECTED` — rose
- A button group rendered only when the transition is allowed by §1
  matrix. Clicking `Reject` or `Accept` opens a small inline confirm
  pane with an optional `note` textarea (≤ 500 chars), then fires a
  server action that calls `PATCH /applications/:id/status`.
- On success: optimistic status update, revalidate the page data
  (`revalidatePath`), show a toast-like emerald banner.
- On failure: rose banner with the server's error message, no state
  change.

### 4.2 File: new `apps/web/src/app/[locale]/company/requests/[id]/applications/[appId]/page.tsx`

Detail page for a single application. Renders the trainer profile
summary, the cover letter, proposed rate/timeline, and the audit trail
read from `GET /applications/:appId/history`. Each history row shows
`fromStatus → toStatus`, actor name, note, and relative time.

### 4.3 i18n

New keys under `company.applications.*` in `apps/web/messages/en.json` and
`apps/web/messages/ar.json`:

```
status.applied / status.shortlisted / status.accepted / status.rejected
actions.shortlist / actions.accept / actions.reject / actions.revert
note.label / note.placeholder / note.maxLength
history.title / history.empty / history.changedStatus / history.relative.*
confirm.accept / confirm.reject
errors.invalidTransition / errors.terminal
```

No RTL-specific overrides — the shared layout already handles
`dir="rtl"` for Arabic (verified in T9 of the golden E2E).

## 5. Testing & verification

- **Unit (API)**: add a `applications.service.spec.ts` covering:
  - valid transitions succeed
  - invalid transitions throw `BadRequestException`
  - terminal `ACCEPTED` / `REJECTED` reject further changes
  - audit row is created with the correct shape in the same transaction
  - unauthorised owner gets `ForbiddenException` (already covered by the
    existing ownership check)
- **Playwright golden flow**: add two assertions on top of T6 — the
  company sees the status badge and an `Accept` / `Reject` button; after
  clicking `Accept` the badge flips and the history row appears. No new
  spec file, just extending `golden-flow.spec.ts`.
- **Manual**: hit `PATCH /applications/:id/status` twice concurrently
  with the same `fromStatus` (curl `&` background) — exactly one should
  succeed (proves the atomic claim) and exactly one audit row lands.

## 6. Out of scope (intentional)

- Tier 1.E: profile editor polish, image uploads, skills UX. Any profile
  work stays in its own PR.
- Trainer-initiated `WITHDRAWN` action and email notifications on status
  change — deferred.
- Batch status updates from the list view.
- CSV / JSON export of the audit trail.
- Permission delegation to `COMPANY_MEMBER` with role `RECRUITER`
  (schema supports it via `CompanyMember` but the UI will stay
  owner-only for MVP).
