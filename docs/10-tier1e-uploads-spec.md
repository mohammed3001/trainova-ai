# Tier 1.E — Image / File Uploads Plan (spec only)

> **Status:** design proposal. Not implemented in PR A (`Tier 1.E profile
> editor polish`). Target for a follow-up PR after review sign-off.

## 1. Goals

Enable avatars, logos and credential attachments across the app without
taking on a hand-rolled file-server. Specifically we need to support:

| Asset                         | Owner                 | Visibility | Size budget    |
| ----------------------------- | --------------------- | ---------- | -------------- |
| Company logo                  | `Company.logoUrl`     | Public     | ≤ 512 KB, square, PNG/JPG/WEBP |
| Trainer avatar                | `User.avatarUrl` (new) | Public     | ≤ 512 KB       |
| Trainer portfolio piece       | `TrainerAsset` (new)  | Public     | ≤ 5 MB each, 10 max |
| Application attachment        | `ApplicationAttachment` (new) | Private (company + trainer only) | ≤ 10 MB each, 5 max |
| Evaluation test artifact      | `TestAttemptAsset` (new) | Private    | ≤ 20 MB each, 3 max |

PR A has already added a `logoUrl` field to the company editor as a
**direct URL input**. The uploads feature will keep that URL-based path
as the storage target and layer a managed upload on top.

## 2. Storage options (recommendation first)

### 2.1 Recommended: **S3-compatible object storage + presigned PUT**

- **Provider candidates:** Cloudflare R2 (egress-free, S3 API), AWS S3,
  or Wasabi. Default to **R2** — free egress matters for image-heavy
  profile browsing, and the S3 SDK works as-is.
- **Bucket layout:**
  ```
  trainova-prod/
    company-logos/<companyId>/<hash>.<ext>
    trainer-avatars/<userId>/<hash>.<ext>
    trainer-assets/<trainerProfileId>/<hash>.<ext>
    application-attachments/<applicationId>/<hash>.<ext>
    test-artifacts/<attemptId>/<hash>.<ext>
  ```
  Public buckets for logos/avatars/trainer-assets (CDN-fronted, cache
  forever using content-hash filenames). Private bucket for the bottom
  two, served via time-limited presigned GET URLs.
- **Client flow (SPA direct upload):**
  1. Browser → API: `POST /api/uploads/presign` with
     `{ kind: 'company-logo' | 'trainer-avatar' | 'trainer-asset'
        | 'application-attachment' | 'test-artifact',
        mimeType, byteLength, entityId }`.
  2. API validates role, quota, MIME, size, and entity ownership, then
     returns `{ url, method: 'PUT', headers, objectKey,
        expectedPublicUrl }`.
  3. Browser PUTs the file directly to object storage with the presigned
     URL — the API server never proxies the bytes.
  4. On success, browser → API:
     `POST /api/uploads/commit`
     `{ kind, entityId, objectKey, mimeType, byteLength }`.
  5. API verifies the object exists (`HEAD` call), re-verifies size,
     then writes `logoUrl` / `TrainerAsset` row / etc. with the public
     URL. Commit is idempotent on `(entityId, objectKey)`.

Why presigned PUT not POST-through-API:

- Keeps the Node API stateless, small, and cheap — no streaming through
  NestJS, no `busboy`/`multer` memory pressure.
- Avoids a single upload tying up a request worker for seconds.
- Lets us rate-limit the presign endpoint (cheap) rather than the upload
  itself.

### 2.2 Alternative: **Vercel Blob / Supabase Storage**

Same contract as 2.1 from the API's perspective (presigned PUT). Worth
choosing only if the deployment target is already on that platform.
Main downside for us: egress cost on Vercel Blob, and a proprietary SDK
that we'd have to abstract if we ever leave.

### 2.3 Not recommended: **API-proxied multipart**

Nest controller accepts `multipart/form-data`, streams to storage. It
"just works" but couples upload throughput to API CPU/RAM and makes
server-side retries more expensive. Keep as a fallback if presigned
PUTs are blocked by a hosting constraint.

## 3. API shape

```
POST /api/uploads/presign
  body: { kind, mimeType, byteLength, entityId }
  auth: JWT required; @Roles depends on kind
  rate-limit: 30/min/user (ThrottlerGuard, keyed on user.id not IP)
  returns: { url, method, headers, objectKey, expiresAt, expectedPublicUrl }

POST /api/uploads/commit
  body: { kind, entityId, objectKey, mimeType, byteLength }
  auth: JWT required; re-checks ownership
  side effects: updates Company.logoUrl / writes TrainerAsset row / etc.
  audit: AuditLog row with action='ASSET_UPLOADED'

DELETE /api/uploads/:kind/:entityId/:assetId
  auth: JWT required; @Roles = owner only
  side effects: soft-delete DB row, enqueue background S3 delete
  audit: AuditLog row with action='ASSET_DELETED'
```

All endpoints validated by Zod. `kind` is an enum; the Zod schema is
exported from `@trainova/shared` alongside a `UPLOAD_QUOTAS` table so
both the client and the backend share size / count limits.

## 4. Validation & security

| Concern            | Mitigation |
| ------------------ | ---------- |
| MIME spoofing      | Allow-list (`image/png`, `image/jpeg`, `image/webp` for images; `application/pdf`, `application/zip`, `text/plain` for attachments). Server re-sniffs the first 4 KB via `file-type` after commit for private kinds; for public kinds we rely on the allow-list + CSP because attackers can only overwrite their own avatar. |
| Oversized uploads  | Presign enforces `byteLength` in the policy so S3 rejects mismatched PUTs; commit re-checks via `HEAD`. |
| Malware            | Out of scope for MVP. For private attachments we queue a ClamAV scan (BullMQ job) post-commit and mark the row `scanStatus='pending'` → `clean|infected`. Files marked `infected` are never served. |
| Path traversal     | Object keys are server-generated from `<kind>/<entityId>/<sha256>.<ext>` — client never sends a key. |
| Per-user DoS       | Throttle presign at 30/min/user, enforce per-entity max counts on commit inside a DB tx. |
| Cross-tenant leak  | Private assets served via presigned GETs, 5-minute TTL, generated by an endpoint that re-checks ownership every time. Never embed private-bucket URLs in SSR HTML. |
| EXIF / PII         | On commit for avatars/logos, enqueue a BullMQ job that re-encodes the image (sharp) to strip EXIF and produce 64/128/512 px variants. Replace `logoUrl` with the processed URL. |

## 5. Frontend UX (AR/EN)

Shared `<FileDropzone>` client component:

- Drag-drop target with keyboard-accessible "Browse" fallback.
- Client-side pre-flight: MIME + size + square-ish aspect (for logos).
- Uploads one file at a time; shows per-file progress bar via
  `fetch` + `XMLHttpRequest` (fetch doesn't expose upload progress).
- On success → calls commit endpoint → optimistically swaps preview.
- Error states have distinct red/rose styling (matches the new profile
  form banners landed in PR A).

Trainer profile form (PR A already shipped the text-URL inputs):

- New "Avatar" section above "Basics" with a 128 px circular preview.
- "Portfolio / work samples" section under "Skills" with up to 10
  tiles, reorderable.

Company profile form:

- Replace the `logoUrl` URL input with the dropzone + preview. Keep the
  URL input as a fallback for users who prefer to paste a CDN URL.

AR-locale considerations:

- `<html dir="rtl">` is already honored, so the dropzone flex direction
  flips automatically.
- All strings live under `profile.uploads.*` in `messages/{en,ar}.json`.

## 6. Schema additions

```prisma
model User {
  // ...
  avatarUrl String?
}

model TrainerAsset {
  id        String   @id @default(cuid())
  profileId String
  kind      String   // 'portfolio' | 'certificate'
  url       String
  title     String?
  order     Int      @default(0)
  createdAt DateTime @default(now())

  profile   TrainerProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)

  @@index([profileId, order])
}

model ApplicationAttachment {
  id            String   @id @default(cuid())
  applicationId String
  objectKey     String
  mimeType      String
  byteLength    Int
  scanStatus    String   @default("pending") // pending | clean | infected
  createdAt     DateTime @default(now())

  application   Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)

  @@index([applicationId])
}
```

A TOCTOU-safe commit uses the same pattern we landed in PR #10: an
interactive transaction + conditional `updateMany` to claim the row
once, so a double-click can't create two trainer-asset rows pointing at
the same object key.

## 7. Env / secrets

```
OBJECT_STORAGE_ENDPOINT=https://<account>.r2.cloudflarestorage.com
OBJECT_STORAGE_REGION=auto
OBJECT_STORAGE_BUCKET_PUBLIC=trainova-public
OBJECT_STORAGE_BUCKET_PRIVATE=trainova-private
OBJECT_STORAGE_PUBLIC_BASE_URL=https://assets.trainova.ai
OBJECT_STORAGE_ACCESS_KEY_ID=...
OBJECT_STORAGE_SECRET_ACCESS_KEY=...
```

These need to be added to `.env.example`, the Vercel/Fly env list, and
the Devin environment config (never checked in).

## 8. Rollout plan

1. **PR B1 — infra** (this spec → implementation): env wiring,
   `@trainova/uploads` package with the S3 client + Zod schemas, Nest
   module exposing `/uploads/presign` + `/uploads/commit` with stub
   validators, shared `<FileDropzone>` in `apps/web/src/components`.
2. **PR B2 — company logo**: hook company form up to the dropzone,
   migrate existing `logoUrl` values forward.
3. **PR B3 — trainer avatar**: add `User.avatarUrl`, migration, expose
   on trainer detail + list pages, hook editor up.
4. **PR B4 — trainer portfolio**: `TrainerAsset` model + UI grid.
5. **PR B5 — application attachments (private bucket)**: requires
   presigned-GET endpoint + (optionally) the ClamAV worker.
6. **PR B6 — test artifacts**: same pattern as B5.

Each PR is independent and has its own Playwright coverage added to
the golden-flow spec.

## 9. Out of scope for the uploads feature

- Video upload (would need chunked + background transcode).
- Server-side image cropping UI (client-side + fixed output size only).
- Download rate-limiting per-asset (CDN-level, not app-level).
- Public sharing links with expiry (can layer on later using signed
  URLs).

## 10. Open questions

1. Do we self-host ClamAV or use a managed scanner (e.g. Cloudmersive
   Virus Scan)? Affects B5 timeline.
2. Should trainer portfolio files be limited to images only, or do we
   allow PDF case-studies? Impacts dropzone MIME allow-list.
3. Do we need "logo on dark background" vs "logo on light background"
   variants for company listings, or one logo is enough?
