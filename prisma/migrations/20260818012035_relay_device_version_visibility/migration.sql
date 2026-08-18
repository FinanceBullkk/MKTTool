-- AlterTable
ALTER TABLE "RelayDevice" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "relayVersion" INTEGER;
