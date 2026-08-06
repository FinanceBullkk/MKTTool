-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "deviceId" TEXT;

-- CreateIndex
CREATE INDEX "Account_deviceId_idx" ON "Account"("deviceId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "RelayDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
