# Tier 1.B — Auth completion spec (PR #8)

Scope: email verification + forgot / reset password. No rate limiting, no cookie
audit, no profile work — those stay in A-4 and A-6 as planned.

## Endpoint list

| Method | Path                         | Auth | Purpose                                                        |
| ------ | ---------------------------- | ---- | -------------------------------------------------------------- |
| POST   | `/api/auth/verify-email`     | –    | Exchange a verify token for `emailVerifiedAt`.                 |
| POST   | `/api/auth/resend-verification` | –  | Re-issue a verify token for an unverified account. Neutral 200. |
| POST   | `/api/auth/forgot-password`  | –    | Issue a single-use reset token. Always returns 200.            |
| POST   | `/api/auth/reset-password`   | –    | Consume a reset token and set a new password.                  |

Register (`POST /api/auth/register`) now triggers a fire-and-forget
verification email on success. The response payload is unchanged.

## Token lifecycle

| Token              | Bytes | TTL  | Storage                                      | Single-use | On new request             |
| ------------------ | ----- | ---- | -------------------------------------------- | ---------- | -------------------------- |
| Email verification | 32    | 24h  | `EmailVerificationToken` (sha256 digest only) | yes        | Previous unconsumed tokens for that user are marked `consumedAt=now` so only the newest link works. |
| Password reset     | 32    | 30m  | `PasswordResetToken` (sha256 digest only)     | yes        | Previous unconsumed tokens for that user are consumed, and all active refresh sessions are revoked on successful reset. |

Opaque tokens are generated with `crypto.randomBytes` and delivered via a
`base64url` string in the email link. Only the SHA-256 digest is persisted,
matching the pattern already used for refresh tokens.

## Expiry / neutral-response behaviour

- `forgot-password` and `resend-verification` **always** return `{ ok: true }`
  regardless of whether the email exists, to prevent user enumeration.
- `verify-email` and `reset-password` return `400` with `Invalid or expired
  token` for any of: unknown token, already consumed, past-expiry.
- On successful `reset-password`, all active refresh sessions for the user are
  revoked (`refreshToken.revokedAt` set to `now`). This logs out other devices
  after a password change.

## Template usage (from PR #7)

| Flow                | Template                | AR | EN |
| ------------------- | ----------------------- | -- | -- |
| Register → verify   | `renderVerifyEmail`     | ✓  | ✓  |
| Resend verification | `renderVerifyEmail`     | ✓  | ✓  |
| Forgot password     | `renderResetPassword`   | ✓  | ✓  |

Verify / reset URLs are built from `NEXT_PUBLIC_SITE_URL` (fallback
`APP_URL`, fallback `http://localhost:3000`) and locale-prefixed.

## UI pages / forms

| Route                               | Purpose                                                         |
| ----------------------------------- | --------------------------------------------------------------- |
| `/[locale]/forgot-password`         | Form → `POST /auth/forgot-password`. Shows neutral success pane. |
| `/[locale]/reset-password?token=…`  | Form → `POST /auth/reset-password`. Shows "password updated" + login CTA on success. |
| `/[locale]/verify-email?token=…`    | Server component calls `POST /auth/verify-email` on render so the token is consumed once. |

Login page now links to `/[locale]/forgot-password` via a "Forgot password?"
link. All new pages render AR/EN with the existing `dir="rtl"` layout.

## Migration / env changes

- **Migration**: `packages/db/prisma/migrations/20260422201728_tier1b_auth_tokens`
  adds `EmailVerificationToken` + `PasswordResetToken` tables (two columns each
  are indexed — `userId` non-unique, `tokenHash` unique). Cascade-on-delete
  from `User`.
- **Env**: no new variables. `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY`
  already shipped in PR #7. `NEXT_PUBLIC_SITE_URL` / `APP_URL` is read from
  existing config (optional; falls back to `http://localhost:3000` for dev/CI).

## Out of scope (intentional — next PRs)

- Rate limiting per endpoint (planned for A-4).
- Cookie flag / production hardening audit (A-4).
- Gating write endpoints on `emailVerifiedAt` (deferred; current policy:
  verification is offered but not enforced at MVP).
- UI "resend verification email" button on the dashboard (deferred).
