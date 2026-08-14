ALTER TABLE "RelayDevice"
  ADD COLUMN "retirementId" TEXT,
  ADD COLUMN "retirementCompletionHash" TEXT,
  ADD COLUMN "retirementCompletionGrant" TEXT,
  ADD COLUMN "retirementAuthorization" TEXT,
  ADD COLUMN "retirementAuthorizationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "retirementFinalizationKeyEnc" TEXT,
  ADD COLUMN "retirementFinalizationAuthorization" TEXT,
  ADD COLUMN "retirementCompletedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "RelayDevice_retirementId_key" ON "RelayDevice"("retirementId");

-- Roll back only when no retirement is pending. Dropping a pending finalization seed can strand a
-- cleaned Relay receipt permanently; completed rows lose retirement audit metadata.
-- DROP INDEX "RelayDevice_retirementId_key";
-- ALTER TABLE "RelayDevice"
--   DROP COLUMN "retirementId",
--   DROP COLUMN "retirementCompletionHash",
--   DROP COLUMN "retirementCompletionGrant",
--   DROP COLUMN "retirementAuthorization",
--   DROP COLUMN "retirementAuthorizationExpiresAt",
--   DROP COLUMN "retirementFinalizationKeyEnc",
--   DROP COLUMN "retirementFinalizationAuthorization",
--   DROP COLUMN "retirementCompletedAt";
