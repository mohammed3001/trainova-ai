# @trainova/e2e — Playwright golden-flow regression

Codifies the 11-step manual golden E2E flow (see `docs/test-plan-e2e-golden.md`
and `docs/test-report-e2e-run2.md`) as an automated Playwright spec so future
changes cannot silently break the verified path.

## Prerequisites

- Postgres + Redis running (`pnpm db:up` at repo root).
- Migrations applied (`pnpm db:migrate:deploy`) and demo data seeded (`pnpm db:seed`).
- API (`http://localhost:4000`) and Web (`http://localhost:3000`) running (`pnpm dev`).
- Playwright browsers installed once: `pnpm --filter @trainova/e2e run install:browsers`.

## Run

```bash
# default (headless, one chromium worker, serial)
pnpm --filter @trainova/e2e test

# interactive UI mode
pnpm --filter @trainova/e2e test:ui

# headed (watch the browser)
pnpm --filter @trainova/e2e test:headed

# open the last HTML report
pnpm --filter @trainova/e2e report
```

Both URLs are configurable via env vars:

- `BASE_URL` (default `http://localhost:3000`) — Next.js web.
- `API_BASE_URL` (default `http://localhost:4000`) — NestJS API (for Swagger assertion).

## What it covers

The single `tests/golden-flow.spec.ts` spec runs all 11 steps of the golden flow
in serial order against a freshly seeded database:

1. Company registration → lands on company dashboard.
2. Company posts a job request → visible on own dashboard.
3. Public marketplace listing shows the new request without auth.
4. Trainer registration → lands on trainer dashboard.
5. Trainer applies → emerald "Application submitted" success banner
   (proves the `ZodValidationPipe` fix from PR #1).
6. Company sees the new application on the request applications page.
7. Admin login → KPI overview page renders with 5 KPI cards.
8. Admin sub-pages (`/admin/users`, `/admin/companies`, `/admin/requests`) load.
9. Arabic admin (`/ar/admin`) renders with `<html dir="rtl" lang="ar">` and
   the Arabic heading "نظرة عامة".
10. Logout via `/api/logout` → cookies cleared → header returns to
    unauthenticated state (proves the route-handler logout from PR #2).
11. Swagger `/docs` loads with the expected tag set.

Each run uses fresh unique emails (`Date.now()` suffix) so the spec is
idempotent — you can run it back-to-back without resetting the DB.
