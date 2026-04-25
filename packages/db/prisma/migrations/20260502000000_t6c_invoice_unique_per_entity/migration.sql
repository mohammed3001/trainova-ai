-- T6.C hardening — enforce idempotency at the DB layer.
--
-- The application-level findFirst+create pattern in InvoiceService has a
-- TOCTOU window: two concurrent callers (e.g. a webhook replay racing
-- a manual admin retry) can both observe "no existing invoice" and both
-- proceed to mint a fresh YYYY-NNNNNN number for the same milestone or
-- payout. Partial unique indexes close the race — the second writer
-- gets a P2002 which the service catches and resolves by returning the
-- row that won the race.
--
-- Excluding VOID means a correction chain (void + reissue under the
-- same milestone/payout) is still possible without tripping the index.

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_kind_milestoneId_active_uniq"
  ON "Invoice" ("kind", "milestoneId")
  WHERE "milestoneId" IS NOT NULL AND "status" <> 'VOID';

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_kind_payoutId_active_uniq"
  ON "Invoice" ("kind", "payoutId")
  WHERE "payoutId" IS NOT NULL AND "status" <> 'VOID';
