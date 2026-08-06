-- CreateTable
CREATE TABLE "RelayInvite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "wrappedVaultKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelayInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelayInvite_userId_idx" ON "RelayInvite"("userId");

-- AddForeignKey
ALTER TABLE "RelayInvite" ADD CONSTRAINT "RelayInvite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
