-- AlterTable
ALTER TABLE "ObserverProxy" ADD COLUMN "lastCheckDetail" TEXT;
ALTER TABLE "ObserverProxy" ADD COLUMN "lastCheckVerdict" TEXT;
ALTER TABLE "ObserverProxy" ADD COLUMN "lastCheckedAt" DATETIME;
ALTER TABLE "ObserverProxy" ADD COLUMN "lastExitIp" TEXT;
