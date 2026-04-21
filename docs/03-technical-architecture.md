# Trainova AI — Technical Architecture & Engineering Plan

**الإصدار:** 1.0
**الهدف:** وثيقة معمارية شاملة لبناء المنصة بشكل قابل للتوسع عالميًا، متوافق مع أفضل الممارسات، وجاهز للمستثمرين والمطورين.

---

## 1. مبادئ تصميم المنصة (Design Principles)
1. **Modular Monolith → Services-Ready**: نبدأ بمونوليث موديولار نظيف (NestJS) ونفصل الخدمات الحرجة (Chat, Evaluation Runner) لاحقًا.
2. **API-First**: كل شيء يمر عبر REST + تدريجيًا GraphQL للشركات Enterprise.
3. **Multi-Tenancy by Role**: Company / Trainer / Admin كلهم في نفس DB مع عزل صارم بواسطة RLS ومستوى تطبيقي.
4. **i18n-First + RTL**: كل عنصر UI يدعم RTL/LTR من البداية (Arabic + English).
5. **Security-by-Default**: JWT + refresh، 2FA، RBAC، Audit Logs، Rate-limiting.
6. **Observability-by-Default**: logs منظمة، traces، metrics، Sentry.
7. **Cloud-Portable**: Docker + Postgres + Redis + S3-compatible storage.
8. **Content Generation via AI**: SEO، Matching، Chat summaries تعمل كـ internal services قابلة للتبديل.

---

## 2. اختيار التقنيات (Tech Stack)

| الطبقة | الاختيار | السبب |
|--------|----------|-------|
| **Frontend** | Next.js 15 (App Router) + React 19 + TypeScript | SSR/ISR/SEO قوي، دعم i18n/RTL ممتاز، familiar للفريق (مثل phonespecs). |
| **Styling** | Tailwind CSS v4 + shadcn/ui + Radix | تصميم سريع، RTL-ready، مكونات accessible. |
| **i18n** | next-intl | نضج في App Router، مطابق لـ phonespecs. |
| **Backend** | NestJS (Node 22) + TypeScript | بنية وحدات قوية، dependency injection، إنتاجي للشركات. |
| **ORM** | Prisma v6 | Type-safe، migrations، متوافق مع stack الحالي. |
| **DB** | PostgreSQL 16 | Relational + JSONB للمرونة + RLS. |
| **Cache/Queue** | Redis 7 + BullMQ | Jobs، pub/sub، rate-limiting، chat presence. |
| **Search** | Meilisearch (MVP) → Elasticsearch (scale) | بحث سريع وبسيط للدليل. |
| **Storage** | S3-compatible (Supabase / R2 / Spaces) | ملفات السير الذاتية، Portfolios، مرفقات الدردشة. |
| **Auth** | NestJS + Passport (JWT + Refresh) + TOTP (2FA) | خفيف ومتحكم فيه. |
| **Payments** | Stripe (global) + Manual invoicing (Enterprise) | MVP سريع. |
| **Email** | Resend / Postmark + React Email | قوالب JSX قابلة للتعديل من الأدمن. |
| **Realtime** | WebSockets via NestJS Gateway (Socket.IO) | دردشة، إشعارات، presence. |
| **AI Services** | Pluggable provider (OpenAI / Anthropic / OSS) عبر `AIProvider` interface | تبديل المزود دون تغيير الكود. |
| **Observability** | Sentry + pino + OpenTelemetry | أخطاء، تتبع، مقاييس. |
| **Infra** | Docker Compose (dev) → Fly.io / Railway / Kubernetes (prod) | مرن ومتدرج. |
| **CI/CD** | GitHub Actions | lint + type-check + test + build + deploy. |

---

## 3. هيكل المستودع (Monorepo Layout)

```
trainova-ai/
├── apps/
│   ├── web/                    # Next.js (public + portals + admin UI shell)
│   └── api/                    # NestJS (all backend modules)
├── packages/
│   ├── db/                     # Prisma schema + client
│   ├── shared/                 # DTOs, types, enums, validation
│   ├── ui/                     # Shared UI components
│   └── config/                 # eslint, tsconfig, tailwind presets
├── docs/                       # Product + architecture docs
├── .github/workflows/          # CI pipelines
├── docker-compose.yml
├── turbo.json                  # (optional) turbo for task caching
└── package.json
```

---

## 4. نموذج البيانات (Database Schema — Core Entities)

نستخدم Prisma. المفاتيح الرئيسية مختصرة هنا؛ الحقول التفصيلية في `packages/db/schema.prisma`.

### 4.1 Identity & Access
- **User** (id, email, passwordHash, role [COMPANY_OWNER | COMPANY_MEMBER | TRAINER | ADMIN | SUPER_ADMIN | ...], status, emailVerifiedAt, twoFactorSecret, lastLoginAt, locale).
- **Session / RefreshToken** (id, userId, hash, userAgent, ip, expiresAt).
- **Permission / Role** (RBAC متدرج للأدمن: SuperAdmin, Finance, Support, Content, Ads, Moderator).
- **AuditLog** (actorId, action, entityType, entityId, diffJson, ip, createdAt).

### 4.2 Organizations
- **Company** (id, ownerId, name, slug, logoUrl, websiteUrl, country, industry, size, description, verified, verificationDocs, billingInfo, stripeCustomerId, createdAt).
- **CompanyMember** (companyId, userId, role [OWNER, ADMIN, RECRUITER, VIEWER]).

### 4.3 Trainer Profile
- **TrainerProfile** (userId, headline, bio, country, languages[], timezone, hourlyRateMin, hourlyRateMax, availability, responseTimeHours, verified, verificationBadges, linkedinUrl, githubUrl, websiteUrl).
- **TrainerSkill** (profileId, skillId, level, yearsOfExperience, proofUrl).
- **TrainerExperience** (profileId, company, role, startDate, endDate, summary, technologies).
- **TrainerCertification** (profileId, name, issuer, issuedAt, credentialUrl).
- **TrainerPortfolioItem** (profileId, title, url, description, tags[], coverUrl).
- **TrainerBadge** (profileId, badge, awardedAt, reason).

### 4.4 Taxonomies
- **Skill** (id, slug, name[locale], category, description). *e.g. Fine-tuning, Prompt Engineering, RLHF, NLP, CV, Data Labeling…*
- **Industry** (id, slug, name[locale]).
- **ModelFamily** (id, slug, name). *e.g. GPT-4, Llama, Mistral, Claude, Gemini, Custom*
- **Tool** (id, slug, name). *e.g. OpenAI API, LangChain, LlamaIndex, HuggingFace, Weights & Biases*
- **Language** (id, code, name).
- **Country** (id, code, name, region).

### 4.5 Job Requests (قلب المنصة)
- **JobRequest** (id, companyId, title, slug, description, objective, modelFamilyId, industryId, languageCodes[], dataVolumeNote, durationDays, budgetMin, budgetMax, currency, confidentialityLevel, workType [REMOTE|ONSITE|HYBRID], status [DRAFT|OPEN|IN_REVIEW|CLOSED|ARCHIVED], visibility [PUBLIC|INVITE_ONLY], featured, createdAt, publishedAt, closedAt).
- **JobRequestSkill** (requestId, skillId, required [MUST|NICE], minYears).
- **JobRequestRequirement** (requestId, type [YEARS|CERT|LOCATION|LANGUAGE|TOOL|CUSTOM], key, operator, value, weight). — **حقول مخصّصة قابلة للتوسع**
- **JobRequestQuestion** (requestId, type [TEXT|MCQ|MULTI|SCALE|FILE|TECHNICAL], prompt, options[], required, order).
- **ModelBinding** (requestId, type [API|WEBHOOK|SANDBOX|ENDPOINT], baseUrl, authHeaderName, authSecretRef, schemaJson, timeoutMs, allowedActions[]). — **ربط النموذج أو البيئة**

### 4.6 Applications & Evaluations
- **Application** (id, requestId, trainerId, status [APPLIED|SHORTLISTED|TEST_ASSIGNED|TEST_SUBMITTED|INTERVIEW|OFFERED|ACCEPTED|REJECTED|WITHDRAWN], coverLetter, proposedRate, proposedTimelineDays, matchScore, createdAt).
- **ApplicationAnswer** (applicationId, questionId, answerText, answerJson).
- **Test** (id, requestId, title, description, timeLimitMin, passingScore, scoringMode [AUTO|MANUAL|HYBRID], modelBindingId).
- **TestSection** (testId, title, order, kind [THEORY|PRACTICAL|LIVE_MODEL]).
- **TestTask** (sectionId, prompt, type [MCQ|TEXT|CODE|PROMPT_TUNE|LABEL|LIVE_PROMPT|WORKFLOW], rubricJson, maxScore, order).
- **TestAttempt** (id, testId, trainerId, applicationId, startedAt, submittedAt, status, totalScore, scoreBreakdownJson, durationSec, tokensUsed, aiFeedbackJson, reviewerId, reviewerNotes).
- **TestTaskResponse** (attemptId, taskId, responseJson, autoScore, manualScore, evaluatorComments).

### 4.7 Collaboration
- **Conversation** (id, scope [DIRECT|PROJECT|NEGOTIATION], companyId?, trainerId?, requestId?, projectId?, createdAt).
- **ConversationParticipant** (conversationId, userId, role, mutedUntil, archivedAt).
- **Message** (id, conversationId, senderId, type [TEXT|FILE|SYSTEM|SUMMARY|TASK], body, attachments[], readBy[], createdAt, deletedAt).
- **Attachment** (id, messageId?, postId?, key, name, size, mime).

### 4.8 Projects, Contracts, Payments
- **Project** (id, requestId, companyId, trainerId, applicationId, contractId, status, startDate, endDate).
- **Milestone** (projectId, title, amount, dueDate, status [PENDING|IN_REVIEW|APPROVED|PAID|DISPUTED]).
- **Contract** (id, projectId, templateId, html, signedByCompanyAt, signedByTrainerAt, pdfUrl, version).
- **ContractTemplate** (id, name, kind [NDA|MSA|SOW], bodyHtml, variables).
- **Invoice** (id, projectId, milestoneId?, amount, currency, taxAmount, status, stripeInvoiceId, issuedAt, paidAt).
- **Payout** (id, trainerId, amount, currency, status, stripeTransferId, createdAt).
- **Wallet** (userId, balance, currency). — للنقاط والاشتراكات المميزة.

### 4.9 Monetization
- **Plan** (id, audience [COMPANY|TRAINER], tier, priceMonthly, priceYearly, featuresJson, stripePriceId).
- **Subscription** (id, userId/companyId, planId, status, currentPeriodStart/End, stripeSubscriptionId, cancelAtPeriodEnd).
- **AdCampaign** (id, advertiserId, name, budget, startDate, endDate, status, targetingJson).
- **AdCreative** (campaignId, type [BANNER|SPONSORED_LISTING|FEATURED_TRAINER|CATEGORY_SPONSOR|NEWSLETTER], assetUrl, headline, body, ctaUrl, placements[]).
- **AdImpression / AdClick** (creativeId, viewerId?, placement, createdAt, meta).

### 4.10 Reviews & Trust
- **Review** (id, authorId, targetUserId, projectId, rating, comment, createdAt).
- **Dispute** (id, projectId, raisedById, reason, status, resolution, createdAt, resolvedAt).
- **VerificationRequest** (id, subjectType [USER|COMPANY|TRAINER], subjectId, kind [ID|EMAIL|EXPERIENCE|BUSINESS], status, docsJson, reviewerId, decidedAt).

### 4.11 Content & SEO
- **Page** (id, slug, locale, title, content, metaTitle, metaDescription, schemaJson, status, updatedAt).
- **Article** (id, slug, locale, authorId, title, excerpt, content, coverUrl, tags[], publishedAt).
- **SeoTemplate** (id, entityType, locale, titleTpl, descriptionTpl, h1Tpl, schemaTpl). — صفحات SEO ديناميكية.
- **Sitemap** (auto-generated).

### 4.12 Notifications & Email
- **Notification** (userId, type, payloadJson, readAt, createdAt).
- **EmailTemplate** (id, key, locale, subject, bodyJsx, variables).
- **EmailCampaign** (id, templateId, segmentId, status, scheduledAt, sentAt, stats).
- **Segment** (id, name, filterJson).

### 4.13 Platform Settings
- **Setting** (key, value, group). — logo، ألوان، عملات، لغات، رسوم، تكاملات.
- **FeatureFlag** (key, enabled, rolloutJson).

---

## 5. التصميم المعماري (High-Level Architecture)

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                            │
│   Next.js (Public Site + Company / Trainer / Admin portals)      │
│   SSR + ISR + next-intl (AR/EN RTL/LTR) + shadcn/ui              │
└───────────▲───────────────────────────────────▲──────────────────┘
            │ REST / WebSocket (JSON + JWT)     │ Static CDN
            │                                   │
┌───────────┴───────────────────────────────────┴──────────────────┐
│                         API GATEWAY (NestJS)                     │
│   Auth • RBAC • Rate-Limit • Validation • OpenAPI                │
├──────────────────────────────────────────────────────────────────┤
│ MODULES                                                          │
│   Users • Companies • Trainers • JobRequests • Applications      │
│   Tests & Evaluation • Chat (WS) • Projects & Contracts          │
│   Payments (Stripe) • Subscriptions • Ads • Notifications        │
│   Email • SEO • CMS • Admin • AI (matching/summaries/seo)        │
└───────────▲─────────────▲─────────────▲─────────────▲────────────┘
            │             │             │             │
      ┌─────┴───┐   ┌─────┴───┐   ┌─────┴───┐   ┌─────┴───┐
      │Postgres │   │  Redis  │   │Meilisearch│  │   S3    │
      │ (Prisma)│   │ BullMQ  │   │  (Search) │  │(Storage)│
      └─────────┘   └─────────┘   └───────────┘  └─────────┘

External: Stripe • Email (Resend) • AI Providers (OpenAI/Anthropic/Custom) • Sentry • OpenTelemetry
```

---

## 6. مخطط الوحدات في NestJS (Backend Modules)

```
apps/api/src/
├── main.ts
├── app.module.ts
├── common/            # guards, interceptors, decorators, filters, dto pipes
├── config/            # typed config loader (zod)
├── auth/              # JWT, refresh, sign-up, 2FA
├── users/             # shared user model
├── companies/
├── trainers/
├── taxonomies/        # skills, industries, models, tools
├── job-requests/
├── applications/
├── tests/             # test builder, attempts, scoring
├── model-bindings/    # calls to client APIs/sandboxes (with allow-list)
├── chat/              # WebSocket gateway + messages service
├── projects/
├── contracts/
├── payments/          # stripe adapter + escrow + payouts
├── subscriptions/
├── ads/
├── notifications/
├── email/             # templates + campaigns
├── seo/               # dynamic pages + sitemaps + schema.org
├── cms/               # pages, articles, FAQ
├── admin/             # admin-only endpoints + mission control aggregators
├── ai/                # AIProvider interface + matching + summaries + seo-writer
└── analytics/         # events ingestion + reports
```

**Guards & Interceptors (cross-cutting):**
- `JwtAuthGuard`, `RolesGuard`, `OwnershipGuard`, `ThrottlerGuard`.
- `AuditLogInterceptor` لكل طلب يعدّل بيانات.
- `I18nInterceptor` لإرجاع الرسائل بلغة المستخدم.

---

## 7. مخطط الواجهة الأمامية (Frontend Routes)

```
apps/web/src/app/[locale]/
├── (public)/
│   ├── page.tsx                       # Landing
│   ├── for-companies/
│   ├── for-trainers/
│   ├── skills/[slug]/                 # SEO landing per skill
│   ├── trainers/[slug]/                # Public trainer profile
│   ├── companies/[slug]/               # Public company page
│   ├── requests/[slug]/                # Public job request
│   ├── blog/ ...
│   ├── pricing/
│   ├── help/
│   └── contact/
├── (auth)/
│   ├── login/
│   ├── register/
│   ├── verify-email/
│   └── reset-password/
├── (company)/company/
│   ├── dashboard/
│   ├── requests/[new|id|applications|tests]/
│   ├── chat/
│   ├── contracts/
│   ├── billing/
│   └── settings/
├── (trainer)/trainer/
│   ├── dashboard/
│   ├── profile/
│   ├── opportunities/
│   ├── applications/
│   ├── tests/
│   ├── chat/
│   ├── earnings/
│   └── settings/
└── (admin)/admin/
    ├── dashboard/
    ├── users/ • companies/ • trainers/
    ├── requests/ • tests/
    ├── chats/ • disputes/
    ├── ads/ • subscriptions/ • finance/
    ├── cms/ • seo/ • emails/
    ├── roles/ • audit-log/
    └── settings/
```

**i18n/RTL:** مكونات تستخدم Tailwind logical properties (`ps-*`, `me-*`) و`dir` يُضبط من `locale`. خط `IBM Plex Sans Arabic` للعربية + `Inter` للإنجليزية.

---

## 8. أمثلة على مسارات API (OpenAPI-style excerpt)

```
POST   /auth/register                        # { email, password, role, locale }
POST   /auth/login                           # returns { access, refresh }
POST   /auth/refresh
POST   /auth/2fa/enable                      # TOTP enroll
POST   /auth/2fa/verify

GET    /companies/me
PATCH  /companies/me
POST   /companies/me/verification
GET    /companies/:slug                      # public

GET    /trainers/:slug                       # public
PATCH  /trainers/me
POST   /trainers/me/skills
POST   /trainers/me/portfolio

GET    /job-requests                         # public search + filters
POST   /job-requests                         # company
PATCH  /job-requests/:id
POST   /job-requests/:id/publish
POST   /job-requests/:id/model-binding
GET    /job-requests/:id/matches             # AI Matching (Pro)

POST   /applications                         # trainer applies
GET    /applications?requestId=
POST   /applications/:id/shortlist
POST   /applications/:id/assign-test

POST   /tests                                # create
POST   /tests/:id/attempts                   # start
POST   /tests/:id/attempts/:attemptId/submit
POST   /tests/:id/attempts/:attemptId/grade  # manual

GET    /chat/conversations
POST   /chat/messages
WS     /ws/chat                              # realtime

POST   /projects                             # from accepted application
POST   /projects/:id/milestones
POST   /milestones/:id/submit
POST   /milestones/:id/approve               # releases escrow

POST   /payments/subscriptions
POST   /payments/invoices/:id/pay
POST   /payments/webhooks/stripe

GET    /ads/placements/:slot                 # serve ads (public)
POST   /ads/campaigns                        # advertiser
POST   /ads/events                           # impression/click tracking

# Admin
GET    /admin/overview                       # KPIs
GET    /admin/users
PATCH  /admin/users/:id
POST   /admin/verifications/:id/approve
POST   /admin/disputes/:id/resolve
POST   /admin/cms/pages
POST   /admin/seo/templates
POST   /admin/email/templates
POST   /admin/settings
```

جميع Endpoints محمية بـ `JwtAuthGuard` + `RolesGuard` + `OwnershipGuard` حيث يلزم، ومنشورة تلقائيًا كـ OpenAPI 3.

---

## 9. معمارية الاختبارات الحية (Evaluation Engine — Deeper Dive)

### 9.1 ربط النموذج (Model Binding)
- الشركة تسجل endpoint (API / Webhook / Sandbox / Demo Endpoint) مع:
  - baseUrl، auth header name، secret ref (يُحفظ مشفّرًا بـ libsodium/age).
  - JSON Schema للـ request/response.
  - Allowed actions + timeout + rate-limit.
- نطلق **Evaluation Runner** (BullMQ job) يقوم بـ:
  1. قراءة task prompt.
  2. استدعاء endpoint الشركة بـ allow-list صارم (SSRF-safe HTTP client: لا IPs داخلية).
  3. استلام الرد.
  4. تمريره على rubric (آلي + AI-judge اختياري).
  5. حفظ الرد والدرجة.

### 9.2 أنواع المهام داخل الاختبار
| النوع | الوصف | التقييم |
|-------|-------|---------|
| MCQ | اختيار من متعدد | آلي |
| TEXT | إجابة نصية مفتوحة | يدوي أو AI-judge |
| CODE | كود أو prompt | آلي (tests) + AI-judge |
| PROMPT_TUNE | المدرب يكتب prompt، نشغله على نموذج الشركة | مقارنة بالمتوقع + rubric |
| LABEL | تصنيف بيانات | آلي مقابل ground-truth |
| LIVE_PROMPT | محادثة حية مع نموذج الشركة | مسجلة + rubric |
| WORKFLOW | سلسلة خطوات | آلي + مراجعة |

### 9.3 Scoring Modes
- **AUTO**: تقييم آلي بالكامل.
- **MANUAL**: مراجعة من الشركة أو أدمن.
- **HYBRID**: آلي أولي + مراجعة بشرية.

### 9.4 AI-Judge (اختياري)
واجهة `AIProvider.judge(task, response, rubric)` يُرجع score + reasoning + flags. قابل للتبديل بين OpenAI/Anthropic/OSS.

---

## 10. محرك المطابقة (AI Matching Engine)

**Inputs:** JobRequest (skills, industry, budget, language, modelFamily, requirements) + Trainer (skills, experience, badges, test scores, reviews).

**Steps:**
1. **Hard Filters**: لغة، ميزانية، توفر، حجب محظورين.
2. **Scoring**:
   - Skill overlap (cosine similarity على skill vectors).
   - Experience weight.
   - Test history relevance.
   - Review score.
   - Response time / completion rate.
3. **Vector Embedding**: profile embeddings (pgvector) — يتم تحديثها عند تغيير البروفايل.
4. **Output**: top N مع نسبة تطابق + نقاط القوة + نقاط المخاطر.
5. **Admin Controls**: أوزان كل معيار قابلة للتعديل من لوحة الأدمن.

---

## 11. نظام الإعلانات (Ads Serving)

- **Placements**: homepage, sidebar, search-result, category-page, newsletter, email-footer.
- **Targeting**: category، skill، country، userType.
- **Serving Flow**:
  1. Frontend يطلب `/ads/placements/:slot?ctx=...`.
  2. Ads module يختار creative بناء على targeting + bid + cap.
  3. يُسجّل impression async.
  4. عند النقر → `/ads/events/click` → redirect.
- **Reports**: impressions, clicks, CTR, eCPM لكل campaign.

---

## 12. SEO Engine

- **Programmatic Pages**: `/trainers-in/:country/:skill`, `/skills/:slug`, `/industries/:slug`, `/hire/:skill-experts` — مولّدة من SeoTemplate.
- **Meta & Schema**: title/description/Og/Twitter/JSON-LD (Person, Organization, JobPosting, FAQPage, BreadcrumbList).
- **Sitemap**: مُولّد تلقائيًا لكل locale + index sitemaps.
- **AI-Assisted**: `AIProvider.generateSeo(entity, locale)` لاقتراحات meta & FAQ.
- **Perf**: Next.js ISR + image optimization + edge caching.

---

## 13. البريد الإلكتروني (Email System)

- **React Email** لكل قالب → قابل للتعديل من الأدمن عبر محرر Blocks.
- **Providers**: Resend أو Postmark (قابل للتبديل).
- **Transactional**: register, verify, reset, application, test, invoice, chat.
- **Marketing**: segments + drip + A/B + unsubscribe + analytics.
- **Unsubscribe tokens** مشفّرة.

---

## 14. الأمن (Security)

- **Auth**: Argon2id password hashing، JWT قصير العمر، refresh rotation، 2FA TOTP، device sessions.
- **Transport**: HTTPS فقط، HSTS، CSP صارم، CSRF tokens على الـ Cookie-based flows.
- **Input**: Zod validation على كل DTO، SQL injection محميّة عبر Prisma.
- **SSRF Protection**: عند استدعاء Model Bindings، نمنع IPs داخلية، نُلزم HTTPS، allow-list منصف.
- **Secrets**: متغيرات بيئة + vault للـ production (Doppler/1Password Secrets).
- **Rate Limiting**: `@nestjs/throttler` + Redis store.
- **Audit Logs**: كل action حساس يُسجَّل.
- **GDPR**: export + delete endpoints للمستخدم.

---

## 15. Observability & SRE
- **Logs**: pino JSON → Grafana Loki / Datadog.
- **Traces**: OpenTelemetry → Tempo / Datadog.
- **Metrics**: prom-client → Prometheus / Datadog.
- **Alerts**: Sentry للأخطاء، uptime على endpoints حرجة، budgets على latency.
- **Backups**: Postgres daily snapshots + WAL، S3 versioning.
- **DR**: RPO 1h، RTO 4h في MVP.

---

## 16. بيئة التطوير والنشر

### Dev
```
pnpm install
pnpm -w db:up         # docker compose up -d postgres redis meilisearch minio
pnpm -w db:migrate
pnpm -w db:seed
pnpm -w dev           # runs api + web concurrently
```

### Envs
- `.env.local` (dev) + `.env.test` + `.env.production` (managed via Doppler).

### CI (GitHub Actions)
1. Install + cache pnpm.
2. `pnpm lint` و`pnpm typecheck`.
3. `pnpm test` (unit + integration).
4. `pnpm build`.
5. Docker build + push (on main).
6. Deploy via Fly.io / Railway.

### Environments
- **local**: docker compose.
- **staging**: auto-deploy من `main`.
- **prod**: release-tag deploy.

---

## 17. خطة التنفيذ التقنية المرحلية

### Phase 1 — MVP (شهر 1-3)
- Monorepo scaffold + CI + Docker Compose.
- Auth + 2FA + RBAC.
- Company + Trainer profiles.
- JobRequest CRUD + public listing.
- Applications + basic tests (MCQ/TEXT, auto + manual scoring).
- Chat (WS) + notifications.
- Stripe subscriptions.
- Admin basics (users, requests, CMS, settings, audit log).
- i18n AR/EN + RTL.
- SEO basics + sitemap + robots.
- Transactional emails.

### Phase 2 — Evaluation & Payments (شهر 3-6)
- Model Bindings + Evaluation Runner + AI-Judge.
- Full Test Builder (sections, rubrics, live-model tasks).
- Verification flows + badges.
- Projects + Milestones + Escrow + Payouts.
- Full Ads platform + serving + reports.
- Dynamic SEO pages + AI meta generation.
- Analytics dashboards.

### Phase 3 — Intelligence & Enterprise (شهر 6-12)
- AI Matching (pgvector + weighted scoring).
- AI Chat Summaries + Task Extraction.
- E-signature + advanced contracts.
- Enterprise dashboards + API + White-label.
- Video interviews + screen share.
- Fraud detection + lead scoring.

---

## 18. المخاطر التقنية وخطط التخفيف

| المخاطرة | التخفيف |
|---------|---------|
| التعامل مع APIs خارجية غير موثوقة (Model Bindings) | sandboxing + allow-list + timeouts + circuit breakers |
| تكاليف AI (OpenAI/Anthropic) | cache + batching + pluggable OSS provider |
| حمل real-time chat | WebSocket horizontal scaling عبر Redis adapter |
| SEO duplication في صفحات ديناميكية | canonical + hreflang + index rules صارمة |
| تعقّد admin | تقسيم modular + search + bulk actions + role separation |
| GDPR / Data Residency | region-aware storage + export/delete + consent logs |

---

## 19. معايير الجودة والمراجعات

- **Code**: ESLint strict, Prettier, commit hooks (husky + lint-staged).
- **Types**: `strict: true`, no `any` في الكود الإنتاجي.
- **Tests**: Jest (unit) + Vitest (frontend) + Playwright (E2E على الـ golden paths).
- **Coverage Target**: 70%+ على modules حرجة (auth, payments, evaluation, matching).
- **PR**: template + checks + review إلزامي + Devin review.
- **ADR**: كل قرار معماري يوثّق في `docs/adr/NNN-...md`.

---

## 20. نقطة البدء الفورية (Action Items — Engineering)

1. إنشاء repo `trainova-ai` (monorepo pnpm workspaces).
2. سكافولد `apps/web` (Next.js 15 + next-intl + Tailwind v4 + shadcn/ui).
3. سكافولد `apps/api` (NestJS 10 + Prisma + Zod + Swagger).
4. `packages/db` (Prisma schema كامل للمرحلة الأولى).
5. `packages/shared` (DTOs + enums + zod validators).
6. docker-compose للـ Postgres + Redis + Meilisearch + MinIO.
7. GitHub Actions: lint + typecheck + build.
8. Seed script للمهارات + الصناعات + النماذج + قوالب الاختبارات + قوالب الإيميلات + خطط الاشتراك + إعلانات تجريبية + مستخدم Super Admin + شركة تجريبية + مدرب تجريبي.
9. صفحات Landing + Login + Register + Dashboard shells للثلاث بوابات + Admin shell.
10. PR أولي مع كل ما سبق.

---

**هذه الوثيقة قابلة للتحوّل مباشرة إلى تنفيذ.** المرحلة التالية: MVP.
