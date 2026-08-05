-- CreateTable
CREATE TABLE "RelayDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RelayDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RelayDevice_publicKey_key" ON "RelayDevice"("publicKey");

-- CreateIndex
CREATE INDEX "RelayDevice_userId_idx" ON "RelayDevice"("userId");

-- AddForeignKey
ALTER TABLE "RelayDevice" ADD CONSTRAINT "RelayDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
