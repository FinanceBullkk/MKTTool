ALTER TABLE "RelayDevice"
  ADD COLUMN "operatorKeyGrantGeneration" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "operatorKeyGrantId" TEXT,
  ADD COLUMN "operatorKeyGrantHash" TEXT,
  ADD COLUMN "operatorKeyCompletionHash" TEXT,
  ADD COLUMN "operatorKeyCompletionGrant" TEXT,
  ADD COLUMN "operatorKeyDeliveryAuthorization" TEXT,
  ADD COLUMN "operatorKeyDeliveryExpiresAt" TIMESTAMP(3),
  ADD COLUMN "operatorKeyCompletedGrantId" TEXT,
  ADD COLUMN "operatorKeyCompletedGeneration" INTEGER,
  ADD COLUMN "bootstrapAuthorizationId" TEXT,
  ADD COLUMN "bootstrapAuthorization" TEXT,
  ADD COLUMN "bootstrapAuthorizationExpiresAt" TIMESTAMP(3),
  ADD COLUMN "bootstrapAuthorizationUsedAt" TIMESTAMP(3);

-- Reversible with explicit data loss limited to Phase 04 metadata:
-- ALTER TABLE "RelayDevice"
--   DROP COLUMN "operatorKeyGrantGeneration",
--   DROP COLUMN "operatorKeyGrantId",
--   DROP COLUMN "operatorKeyGrantHash",
--   DROP COLUMN "operatorKeyCompletionHash",
--   DROP COLUMN "operatorKeyCompletionGrant",
--   DROP COLUMN "operatorKeyDeliveryAuthorization",
--   DROP COLUMN "operatorKeyDeliveryExpiresAt",
--   DROP COLUMN "operatorKeyCompletedGrantId",
--   DROP COLUMN "operatorKeyCompletedGeneration",
--   DROP COLUMN "bootstrapAuthorizationId",
--   DROP COLUMN "bootstrapAuthorization",
--   DROP COLUMN "bootstrapAuthorizationExpiresAt",
--   DROP COLUMN "bootstrapAuthorizationUsedAt";
