-- Enforce at most one PENDING VerificationRequest per (submitter, targetType,
-- targetId). Closes a TOCTOU race in VerificationService.submit where two
-- concurrent submits could both pass the `findFirst` pre-check.
--
-- Partial unique index (PostgreSQL) — only rows with status='PENDING'
-- participate, so APPROVED / REJECTED history is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationRequest_pending_unique"
  ON "VerificationRequest" ("submitterId", "targetType", "targetId")
  WHERE "status" = 'PENDING';
