-- AlterTable
ALTER TABLE "Proxy" ADD COLUMN "lastSpeedAt" DATETIME;
ALTER TABLE "Proxy" ADD COLUMN "lastSpeedDetail" TEXT;
ALTER TABLE "Proxy" ADD COLUMN "lastSpeedMbps" REAL;
