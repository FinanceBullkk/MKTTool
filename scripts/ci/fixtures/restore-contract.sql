-- Deterministic, non-sensitive fixture used only by the disposable CI restore contract.
-- It intentionally contains no application credentials or production rows.
CREATE TABLE "RestoreContractProbe" (
  "id" TEXT PRIMARY KEY,
  "label" TEXT NOT NULL,
  "optionalValue" TEXT
);

INSERT INTO "RestoreContractProbe" ("id", "label", "optionalValue") VALUES
  ('probe-001', 'restore-contract', NULL),
  ('probe-002', 'salted-aggregate', 'fixture-only');

-- PostgreSQL database dump complete
