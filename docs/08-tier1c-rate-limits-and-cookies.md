# Tier 1.C — Rate limiting + cookie flag audit (PR #9)

Scope: harden the auth surface shipped in A-2 against brute-force and simple
cookie misconfiguration in production. No new features, no schema changes.

## Rate limits

Global default: `120 req/min/IP` via `ThrottlerModule.forRoot([{ name:
'default', ttl: 60_000, limit: 120 }])`. Per-endpoint `@Throttle()` overrides
live on `AuthController`.

| Endpoint                    | Limit / minute / IP | Rationale                                                 |
| --------------------------- | ------------------: | --------------------------------------------------------- |
| `POST /auth/login`          |                   5 | Slow password guessing. Normal users retry well under 5/min. |
| `POST /auth/register`       |                   5 | Prevents signup spam per IP.                              |
| `POST /auth/forgot-password`|                   5 | Limits email-send amplification and probing.              |
| `POST /auth/reset-password` |                  10 | Generous: users may retype / fix password strength.       |
| `POST /auth/verify-email`   |                  20 | Clicks on links + SSR auto-hits can add up quickly.       |
| `POST /auth/resend-verification` |              3 | Most aggressive — this is the only endpoint that triggers a real email on behalf of any caller. |

Keys are IP-based via `ThrottlerGuard`'s default tracker. When we move behind
a load balancer we'll need to trust proxy headers so `req.ip` reflects the
real client — not in scope for this PR.

Over-limit response: `429 Too Many Requests` with a small body describing the
limit. No user-identifying data in the message.

## Cookie flag audit

`apps/web/src/lib/auth-actions.ts :: setAuthCookies`

| Cookie           | `httpOnly` | `sameSite` | `secure` (prod) | `path` | `maxAge` |
| ---------------- | ---------- | ---------- | --------------- | ------ | -------- |
| `trainova_token` | **true**   | `lax`      | **true**        | `/`    | 14 days  |
| `trainova_role`  | false      | `lax`      | **true**        | `/`    | 14 days  |

`secure` is gated on `process.env.NODE_ENV === 'production'` so the cookie
still works over plain `http://localhost` and inside the disposable-Postgres
CI environment.

`sameSite: 'lax'` is kept (not `strict`) because:
- verify / reset links are followed from an external email client — a
  `strict` cookie would be dropped on the cross-site navigation, which would
  break the "click from email → redirect to dashboard" flow the moment we
  start gating on the token.
- the existing `/api/logout` GET redirect relies on the session cookie being
  sent on a top-level GET.

`trainova_role` is intentionally **not** `httpOnly` — server components read
it for role-aware SSR nav, and it contains no secret. The JWT lives only in
`trainova_token`, which IS `httpOnly`.

## Out of scope (intentional — next PRs)

- Replace `/api/logout` GET with a POST form so it can become CSRF-resistant
  with a `sameSite: 'strict'` token cookie. Needs UI change.
- `X-Forwarded-For` trust configuration for the rate-limiter when we move
  behind a load balancer (infra change).
- CSRF token for state-changing endpoints called from the browser proxy.
- Gating write endpoints on `emailVerifiedAt` (still deferred).

## Verification checklist

- Spam `POST /auth/login` 6 times in < 1 min from one IP → 6th returns 429.
- Same for register / forgot-password at 6/min, resend-verification at 4/min.
- Regular browser traffic (< 10 req/min from the web app) never hits a 429.
- Golden-flow Playwright suite still green — it registers 2 users and logs in
  twice, well under any bucket.
- In a prod build (`NODE_ENV=production`), DevTools → Application → Cookies
  shows `trainova_token` and `trainova_role` with `Secure=true`; in dev build
  `Secure=false` so the cookie persists on localhost.
