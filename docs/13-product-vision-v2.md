# Trainova AI — Product Vision v2

> **Status:** DRAFT for approval. Supersedes 01-product-spec-ar.md where conflicts exist. Grounded in the validated MVP (PRs #1–#20).

---

## 1. Thesis

Trainova AI is a **global, Arabic-first marketplace for AI-training talent** that does three things no competitor bundles together:

1. **Vetting** — companies author custom tests that trainers must pass before hiring conversations begin.
2. **Work-modality integration** — after acceptance, companies can **connect their own model** so the trainer can work against it directly (RLHF feedback, data labeling, prompt engineering, red-teaming).
3. **End-to-end operations** — request authoring → vetting → chat → work → billing → reporting, all in one platform, usable by non-technical company owners and non-technical platform owner.

Everything is available in **Arabic (RTL)** and **English** on day one; additional locales are a later Tier.

---

## 2. Primary personas

| Persona | Needs | Surfaces |
|---|---|---|
| **Company owner** (technical or not) | Post detailed requests, design a custom application form + test, review applicants, interview via chat, connect their model, grant access, pay trainers, track spend | Company dashboard, Tests authoring, Grading console, Chat, Model registry, Billing, Reports |
| **Trainer** (freelancer worldwide) | Showcase skills + portfolio + CV, discover requests, apply with custom answers, take tests, get hired, chat, do work against company models, get paid | Public profile, Discover, Applications, Tests, Chat, Workbench, Earnings |
| **Platform owner / admin** (non-developer) | Run the business without touching code: users, companies, requests, tests, chat, ads, payments, emails, CMS, feature flags, analytics, moderation, audit, i18n overrides | Comprehensive admin panel |
| **End-user advertiser** (monetization) | Reach trainers/companies with targeted ads, pay per-click or per-impression | Self-serve ads dashboard + admin moderation |

---

## 3. Product surfaces

### 3.1 Company side
- Company profile + verification (logo, industry, size, country, tax ID)
- **Dynamic JobRequest builder** (Tier 3) — drag-drop custom form with field types: short text, long text, single/multi select, file, number, date, URL, email, rich-text, scored MCQ. Fields have: label AR/EN, help text, required flag, ordering, conditional visibility.
- Request lifecycle: draft → published → paused → closed
- Applications list with filter/sort/bulk actions
- **Tests** (shipped in #17/#19) — MCQ + TEXT + CODE, manually graded, reusable across applicants in the same request
- **Grading console** with rubric sidecar (shipped in #19)
- Application status workflow + audit (shipped in #11)
- **Chat** (Tier 3) — post-acceptance per-application thread; attachments, read receipts, typing, search
- **Model registry** (Tier 3/4) — register an endpoint (OpenAI-compatible, Anthropic, Bedrock, HuggingFace Inference, or raw HTTPS), store credentials encrypted, scope by request, grant to trainer on acceptance
- **Workbench permissions** — per-trainer access token, rate limit, scope (which models, which features), revocation
- **Billing** (Tier 4) — plan subscription + usage-based add-ons (model-proxy tokens, promoted listings, extra seats); invoices, VAT handling per country
- **Reports** — applicants funnel, test pass rate, cost-per-hire, time-to-hire, model usage per trainer

### 3.2 Trainer side
- Public profile / business card (Tier 3) — SEO URL `/trainers/[slug]`, skills, certifications, portfolio (images + PDFs, shipped #15), experience timeline, hourly rate, availability, languages spoken, response time badge, verification badge
- **CV export** (PDF, AR+EN)
- Discover / browse requests with filters (skill, budget, timeline, remote/onsite, confidentiality tier)
- Apply with **dynamic form answers** that match the company's builder
- Take tests (shipped #20)
- Post-acceptance chat
- **Workbench** (Tier 4) — in-platform interface to interact with the company's connected model: prompt/response collection, RLHF pairwise preference, red-team prompts, rubric-scored outputs; every sample logged as an artifact the company can export
- Earnings dashboard (Tier 4) — balance, payout schedule, KYC
- Ratings from companies (Tier 4)

### 3.3 Admin side — non-technical-owner-friendly
All of the following must be editable via UI, zero SQL required:
- **Users** — list, search, filter by role/status, impersonate, suspend, resend verify, force password reset, change role
- **Companies** — verify KYB, feature (promote), suspend, override plan, refund
- **Requests** — view, moderate, unpublish, delete, reassign owner
- **Tests + Attempts** — browse across all companies, override grade, re-open attempts
- **Applications** — cross-tenant view, force transition, export
- **Chats** — conversation browser (with owner justification prompt + audit), DMCA/abuse actions
- **Ads** (Tier 4) — campaign approval, creative moderation, slot pricing, revenue reports, fraud checks
- **Payments** (Tier 4) — plan management, coupons, manual adjustments, refunds, payout approvals, invoices
- **Email** — provider logs, template editor (AR+EN WYSIWYG), test-send
- **CMS lite** — static pages (About, Terms, Privacy, FAQ, Blog) with AR/EN variants, publish/unpublish
- **i18n overrides** — edit any string without redeploying (DB-backed overrides that layer over file-based messages)
- **Feature flags** — toggle features per role/tenant/percent
- **Analytics dashboard** — DAU/WAU/MAU, funnels, cohort, revenue, top queries
- **Audit log browser** — search, filter, export (already stored in `AuditLog`)
- **Moderation queue** — user reports, AI-flagged content, appeal workflow

> Design rule: every admin screen exposes the raw JSON of the underlying row under a collapsed "Advanced" accordion so the non-technical owner can copy/paste when asking for support, without needing DB access.

---

## 4. Cross-cutting systems

### 4.1 Tests & evaluations — SHIPPED (Tier 2, PRs #17/#19/#20)
Next additions: CODE answering UI, AI-assisted grading, timers.

### 4.2 Chat — Tier 3
- Schema already exists (`Conversation`, `ConversationParticipant`, `Message`).
- Needs: WebSocket layer (Socket.IO on NestJS + Redis adapter), UI (thread list + message pane + composer + attachments + typing indicator + read receipts), push notifications (email fallback), moderation hooks (admin browser), message search, per-thread audit.
- Attachments reuse Tier 1.E uploads infra.

### 4.3 Ads & monetization — Tier 4
- Partial schema exists (`AdCampaign`, `AdCreative`, `AdSlot`, `AdImpression`, `AdClick` in migration baseline).
- Needs: advertiser self-serve dashboard, slot registry (top banner, sidebar, inline), creative upload (reuses uploads infra), targeting (country/role/locale/keyword), budget + daily cap, pricing model (CPC + CPM), frequency cap, impression logging, click tracking with fraud filter, revenue reports, admin moderation.
- **Placement rules:** ads never appear inside grading or chat; only on discover/public pages.

### 4.4 Payments & subscriptions — Tier 4
- **Primary:** Stripe (global, USD + EUR + SAR).
- **Secondary for GCC:** HyperPay / Moyasar / PayTabs for local payment methods (mada, STC Pay, Apple Pay).
- Plans:
  - **Free** — 1 active request, 3 applicants max, no model integration
  - **Starter** — 5 active requests, 25 applicants, basic chat, no model integration
  - **Pro** — 20 active requests, unlimited applicants, chat + model integration, 2 seats
  - **Enterprise** — custom, SSO, SLA, audit export
- Add-ons: promoted listings, extra seats, model-proxy token packs, priority support.
- Trainer payouts: Stripe Connect (global) + wire/IBAN fallback (manual admin approval).

### 4.5 SEO — Tier 4
- Per-entity metadata (title/description/canonical/OG) auto-generated: every request, trainer profile, company profile.
- **Auto-generated OG images** per entity (via @vercel/og or sharp worker).
- JSON-LD: `JobPosting` for requests, `Person` for trainers, `Organization` for companies.
- `sitemap.xml` incremental (paginated by entity type).
- `hreflang` EN/AR on every public page.
- Canonical `/en/...` ↔ `/ar/...` cross-links.
- `robots.txt` with admin/dashboard paths blocked.

### 4.6 Email — Tier 1.A SHIPPED (PR #7) + Tier 4 additions
- Existing: transactional templates (verify, reset, welcome, test-assigned).
- Add: digest emails (weekly applications, new matching requests), notification preferences per user, admin test-send from template editor, provider log viewer.

### 4.7 Model integration — Tier 3/4 (biggest differentiator)
**Core idea:** a company registers their model endpoint once, then when a trainer is accepted, the trainer gets **scoped access** through the platform's proxy — no raw credentials exposed, every request logged.

**Flow:**
1. Company: Dashboard → Models → Add model → choose adapter (OpenAI-compatible / Anthropic / Bedrock / HuggingFace / generic HTTPS) → paste endpoint + credentials → test connection.
2. Credentials encrypted at rest (envelope: KMS → per-company DEK → per-credential ciphertext).
3. Company accepts a trainer on an application → chooses which models the trainer can use + scope (completions, embeddings, fine-tune?), rate limit, daily budget.
4. Trainer sees "Workbench" tab in the application → picks model → uses in-platform UI (prompt/response, pairwise RLHF, rubric scoring, red-team templates) — **all traffic goes through platform proxy.**
5. Every request: rate-limited, budget-gated, logged as a `ModelCall` row with request/response hashes; redacted samples shown in company's analytics.
6. Artifacts (prompt/response pairs, preference labels, rubric scores) are exportable by company as JSONL / Parquet.

**Why this matters:**
- Company never hands raw keys to trainer.
- Platform earns via proxy fees (optional margin on tokens, or flat seat price).
- Creates lock-in: platform owns the training-data artifact corpus.
- Non-technical owner can revoke access instantly without rotating upstream keys.

### 4.8 Dynamic form builder for JobRequest — Tier 3
- Company composes a form in a drag-drop editor.
- Field types: short_text, long_text, single_select, multi_select, file, number, date, url, email, rich_text, rating, boolean.
- Each field: `{id, type, labelAr, labelEn, helpAr, helpEn, required, order, options?, validation?, conditionalVisibility?}`.
- Stored on `JobRequest.applicationSchema` (jsonb).
- Trainer's apply page renders dynamically based on schema, answers stored on `Application.answers` (jsonb).
- Company sees answers alongside standard application fields.
- Search / filter applicants by answer value.

### 4.9 AI matching — Tier 5
- Embeddings on `JobRequest` (title + description + skills) and `User` (skills + bio).
- pgvector for search.
- Ranked "recommended for you" feeds for trainers and "best candidates" for companies.
- Not replacement for browse; it's a layer on top.

### 4.10 Notifications — Tier 3
- Unified notification bus (DB-persisted + in-app bell + email digest + optional push).
- Triggers: application received, status changed, test assigned, test graded, message received, payment succeeded, model credential expiring.
- Per-channel preferences per user.

### 4.11 Global-market readiness — Tier 6
- Timezone support (store UTC, render per user preference).
- Multi-currency display (USD / EUR / SAR / AED + auto-convert via daily FX rate).
- Additional locales after AR/EN: FR, ES, HI (high-skill freelancer markets).
- Tax/invoice generation per country (Saudi ZATCA compliance for SAR invoices, EU VAT-MOSS for EUR).
- GDPR + PDPL compliance: data export, delete-my-account, DPA artifacts in admin.
- Accessibility: WCAG 2.2 AA audit, keyboard-nav everywhere, focus traps in dialogs, RTL parity.

---

## 5. Revised roadmap

Tiers 0–2 are done. The remaining roadmap below is the new proposal.

### **Tier 3 — Differentiated hiring experience** (next, ~4–6 PRs)
- **3.A Chat end-to-end** — WebSocket + UI + attachments + admin browser (biggest user-visible next feature)
- **3.B Dynamic JobRequest form builder** — schema on JobRequest + builder UI + trainer render + storage of answers
- **3.C Trainer public profile** — `/trainers/[slug]` SEO page + PDF CV export
- **3.D Notifications v1** — in-app bell + email digest, triggered by existing events
- **3.E Application attachments UI** — small follow-up, reuses uploads infra

### **Tier 4 — Monetization & model integration** (~5–7 PRs)
- **4.A Model registry + credential vault** — company adds model, encrypted creds, connection test
- **4.B Model proxy + workbench** — trainer UI + proxy API with logging/rate/budget
- **4.C Stripe subscriptions + plans enforcement**
- **4.D Ads system** — advertiser dashboard, admin moderation, serving, reporting
- **4.E SEO automation** — OG images, JSON-LD, sitemaps, hreflang
- **4.F CODE answering UI + timers** — closes the evaluations loop

### **Tier 5 — Comprehensive admin + AI matching** (~4–6 PRs)
- **5.A Admin users/companies CRUD + impersonation**
- **5.B Admin CMS + email template editor + i18n override console**
- **5.C Admin analytics dashboard + audit browser**
- **5.D Feature flags + moderation queue**
- **5.E AI matching (embeddings + pgvector)**

### **Tier 6 — Global scale** (~4 PRs)
- **6.A Timezone + multi-currency**
- **6.B Additional locales (FR/ES)**
- **6.C Tax / invoice / VAT per country**
- **6.D Accessibility audit + WCAG AA fixes**

### **Continuous / background**
- Managed file scanner (from uploads spec)
- Sharp image-processing worker (from uploads spec)
- Logout stale-header cosmetic fix
- Deployment pipeline (Vercel + Fly/Railway + Neon Postgres + Upstash Redis) — when ready

---

## 6. Architectural additions required

| System | Component | Scope |
|---|---|---|
| Realtime | Socket.IO gateway on Nest + Redis pub/sub adapter | Tier 3 |
| Dynamic forms | JSON-schema renderer (custom, no external dep) | Tier 3 |
| Credential vault | AES-256-GCM envelope encryption, KMS-backed in prod | Tier 4 |
| Model proxy | New `@trainova/proxy` app or module, request/response logging | Tier 4 |
| Vector search | `pgvector` extension + embedding jobs | Tier 5 |
| Analytics | Event table + rollup jobs (BullMQ) | Tier 5 |
| CMS | MDX stored in DB with draft/publish flow | Tier 5 |

---

## 7. Migration recommendation

Tier 3 will add at least 3 new tables (Notification table already exists, but Chat attachments, Model, ModelCredential, ModelCall, ApplicationSchema are new-or-extended). Keep committing migrations per PR (`prisma migrate dev --name <scope>`) as we've been doing since PR #4.

---

## 8. Open decisions needed before starting Tier 3

1. **Chat realtime stack** — Socket.IO (easy, mature) or native WebSocket + `ws`? Recommendation: Socket.IO.
2. **Form builder DX** — build custom drag-drop vs adopt [dnd-kit](https://dndkit.com/) + [react-hook-form](https://react-hook-form.com/)? Recommendation: dnd-kit + RHF.
3. **Notifications delivery** — in-app + email only in Tier 3, defer web-push + mobile-push to Tier 6. Recommendation: yes.
4. **Trainer slug** — editable by trainer (with uniqueness) or auto-generated from name? Recommendation: auto with optional override.
5. **Order of Tier 3 PRs** — start with Chat (biggest user impact) or Dynamic form builder (unlocks the "any condition" the company wants)? Recommendation: **Dynamic form builder first**, because it's the piece that differentiates the request-authoring flow and Chat builds on trust that's already established via test + structured application.

---

## 9. What stays out of scope (for now)

- Mobile apps (web-first, mobile web works via responsive UI)
- Video interviews (use external tools via chat link)
- Desktop workbench / plugin
- On-prem / self-hosted deployments
- Whitelabel reseller program
- Blockchain, tokens, NFTs, any web3
