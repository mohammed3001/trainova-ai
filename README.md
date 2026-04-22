# Trainova AI

Global marketplace and evaluation platform for AI training talent.

See `docs/` for product spec, investor pitch, technical architecture, gap analysis, and E2E test reports.

## Stack

- **Web**: Next.js 15 (App Router), React 19 RC, Tailwind CSS v4, `next-intl` (AR/EN + RTL).
- **API**: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, Swagger at `/docs`.
- **Monorepo**: pnpm workspaces (`apps/web`, `apps/api`, `packages/db`, `packages/shared`).

## Prerequisites

- Node.js ≥ 22
- pnpm 9.15.1 (`corepack enable` or install manually)
- Docker + Docker Compose (for Postgres + Redis)

## Local setup (first time)

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env
cp .env.example .env   # edit secrets if you like

# 3. Start Postgres + Redis
pnpm db:up

# 4. Apply migrations (preferred — uses committed history)
pnpm db:migrate:deploy

# 5. Seed demo data
pnpm db:seed

# 6. Run API (:4000) + Web (:3000) in parallel
pnpm dev
```

Open http://localhost:3000. Swagger is at http://localhost:4000/docs.

## Database workflows

| Command                     | When to use                                                                 |
|-----------------------------|-----------------------------------------------------------------------------|
| `pnpm db:migrate:deploy`    | **Default for setup, CI, and deploys.** Applies committed migrations only.   |
| `pnpm db:migrate`           | Dev-only. Creates a new migration from schema changes (`prisma migrate dev`).|
| `pnpm db:push`              | Dev-only escape hatch for schema experiments before committing a migration.  |
| `pnpm db:seed`              | Populates demo accounts + skills + job request + test.                       |
| `pnpm db:generate`          | Regenerates Prisma Client without touching the DB.                           |

The canonical path for any production-adjacent environment is
`db:migrate:deploy` followed by `db:seed` (if seeding is allowed in that env).
`db push` should never run against shared databases.

## Seeded test accounts

- Admin: `admin@trainova.ai` / `Admin12345!`
- Company owner: `owner@acme-ai.com` / `Company123!`
- Trainer: `trainer@trainova.ai` / `Trainer123!`

## Scripts

- `pnpm dev` — run Web + API together.
- `pnpm build` — build all packages (Prisma client, shared, API, Web).
- `pnpm lint` / `pnpm typecheck` — workspace-wide checks.
- `pnpm db:up` / `pnpm db:down` — start/stop Postgres + Redis containers.

## Documentation

- `docs/01-product-spec-ar.md` — product spec (Arabic).
- `docs/02-investor-pitch-en.md` — investor pitch (English).
- `docs/03-technical-architecture.md` — technical architecture.
- `docs/04-technical-planning.md` — post-E2E architecture review.
- `docs/05-gap-analysis.md` — capability gap analysis + priority backlog.
- `docs/test-plan-e2e-golden.md` — manual E2E test plan.
- `docs/test-report-e2e-run2.md` — latest manual E2E run report (11/11 passed).
