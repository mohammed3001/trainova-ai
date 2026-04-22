# Tier 1 — Implementation Plan

Scope: `docs/05-gap-analysis.md` Tier 1 only. No Tier 2 work in this cycle.

## PR sequence (smallest → largest)

| # | PR | Scope | Depends on | Blast radius | Est. diff |
|---|----|-------|-----------|--------------|-----------|
| **A-1** | `feat(email): Resend integration + service abstraction + AR/EN templates` | Add `@trainova/email` package (or `apps/api/src/email/`): `EmailService` interface, `ResendProvider` (prod), `ConsoleProvider` (dev/CI), AR/EN template registry for verify + reset, unit tests for provider selection and template rendering. **No controllers wired yet.** | PR #6 (e2e on main) | Additive only. Nothing consumes it yet. | ~400–500 LOC |
| **A-2** | `feat(auth): email verification (send + confirm)` | `EmailVerificationToken` model + migration, `AuthService.sendVerificationEmail()` called on register, `POST /auth/verify-email { token }` endpoint, `POST /auth/resend-verification`, `/[locale]/verify-email?token=…` web page, gate Company "post request" and Trainer "apply" on `emailVerifiedAt` (or keep soft for MVP — decide in PR). | A-1 | Changes register flow; touches guards. | ~600–800 LOC |
| **A-3** | `feat(auth): forgot/reset password` | `PasswordResetToken` model + migration, `POST /auth/forgot-password`, `POST /auth/reset-password`, web pages `/[locale]/forgot-password` + `/[locale]/reset-password?token=…`, always-200 response on forgot (no user enumeration), token TTL 30m, single-use. | A-2 (shares token table pattern) | Adds two new public endpoints + 2 pages. | ~500–700 LOC |
| **A-4** | `feat(security): rate-limit auth endpoints + cookie flag audit` | Tighten `@Throttle` per-endpoint on login/register/forgot/reset/verify (e.g. 5/min/IP), audit `trainova_token` + `trainova_role` cookies for `SameSite=Lax`, `Secure` in prod, `HttpOnly` where applicable, short-lived CSRF where relevant. | A-1..A-3 (exists to throttle) | Behavioral in prod; verify under load locally. | ~150–250 LOC |
| **A-5** | `feat(applications): company-side status update UI + audit trail` | Already have status field; add `PATCH /applications/:id/status` for company owner, new `ApplicationStatusEvent` model + migration for audit, UI on `/company/requests/:id/applications` with status dropdown + reason note. | none (independent of email) — can run in parallel after A-1 | Adds one endpoint + schema table + UI panel. | ~500–700 LOC |
| **A-6** | `feat(profile): trainer editor polish + skills/fields` | `/trainer/profile` editor with headline, bio, hourly rate, skills multi-select with levels, language pairs. Plan doc for image upload (S3 presigned URL flow) — implement only the plan + schema if storage creds aren't available yet. | none — parallelizable | UI-heavy on one route; schema-safe additions. | ~600–900 LOC |

**Parallelism note**: A-5 and A-6 do not depend on email. If A-2/A-3 get blocked on Resend key setup, start A-5 immediately to keep the cycle moving.

## Dependencies

- **A-1 → A-2 → A-3**: each auth flow reuses the email service + template registry.
- **A-4** depends on A-1..A-3 existing only so there's something real to throttle (we could stub it earlier but no value).
- **A-5, A-6** are independent — can start any time after A-1 merges.
- All of Tier 1 is gated on **PR #6** landing (brings Playwright E2E suite onto main, so every PR is regression-checked).

## Env / integration requirements

| Var | Scope | Needed by | Notes |
|---|---|---|---|
| `RESEND_API_KEY` | org secret | A-1+ | Can be set after A-1 merges because the dev/CI default is `ConsoleProvider` (logs emails, never calls Resend). **A-1 itself does NOT require the secret to land.** |
| `EMAIL_FROM` | env | A-1+ | Already in `.env.example`. Default `"Trainova AI <no-reply@trainova.ai>"` — needs a verified domain on Resend before real sends. |
| `EMAIL_PROVIDER` (new) | env | A-1 | `console` (default) \| `resend`. CI + local dev stay on `console`. Only prod/staging flips to `resend`. |
| `APP_URL` / `NEXT_PUBLIC_SITE_URL` | env | A-2, A-3 | Used to build verification + reset links. Already exists. |

**Resend domain setup** (user action, can be deferred to A-2): verify the sending domain in the Resend dashboard, add SPF/DKIM DNS records. Until then the `console` provider is used and emails are logged — fully functional for E2E.

## Scope guardrails for this cycle

- No chat UI, no payments, no AI matching.
- No storage/CDN migration — if the trainer upload path needs S3, ship a plan + schema only (A-6), not the upload itself.
- Logout stale-header cosmetic issue stays out of scope (Tier 6 in gap analysis).
- Each PR must keep the Playwright golden-flow regression green.
