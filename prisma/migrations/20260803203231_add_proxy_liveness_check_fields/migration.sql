-- AlterTable
ALTER TABLE "Proxy" ADD COLUMN "lastCheckDetail" TEXT;
ALTER TABLE "Proxy" ADD COLUMN "lastCheckVerdict" TEXT;
ALTER TABLE "Proxy" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "Proxy" ADD COLUMN "lastExitIp" TEXT;
