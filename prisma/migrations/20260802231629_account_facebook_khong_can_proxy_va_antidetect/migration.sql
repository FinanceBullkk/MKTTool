-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "emailPasswordEnc" TEXT NOT NULL,
    "totpSecretEnc" TEXT,
    "antidetectProfileId" TEXT,
    "personaId" TEXT NOT NULL,
    "proxyId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COLD_START',
    "quarantineReason" TEXT,
    "karma" INTEGER NOT NULL DEFAULT 0,
    "coldStartUntil" DATETIME,
    "platformCreatedAt" DATETIME,
    "purchasedAt" DATETIME,
    "purchaseNote" TEXT,
    "lastActionAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Account_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "Proxy" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("antidetectProfileId", "coldStartUntil", "createdAt", "emailAddress", "emailPasswordEnc", "id", "karma", "lastActionAt", "passwordEnc", "personaId", "platform", "platformCreatedAt", "proxyId", "purchaseNote", "purchasedAt", "quarantineReason", "status", "totpSecretEnc", "updatedAt", "username") SELECT "antidetectProfileId", "coldStartUntil", "createdAt", "emailAddress", "emailPasswordEnc", "id", "karma", "lastActionAt", "passwordEnc", "personaId", "platform", "platformCreatedAt", "proxyId", "purchaseNote", "purchasedAt", "quarantineReason", "status", "totpSecretEnc", "updatedAt", "username" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_antidetectProfileId_key" ON "Account"("antidetectProfileId");
CREATE UNIQUE INDEX "Account_proxyId_key" ON "Account"("proxyId");
CREATE INDEX "Account_status_idx" ON "Account"("status");
CREATE UNIQUE INDEX "Account_platform_username_key" ON "Account"("platform", "username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
