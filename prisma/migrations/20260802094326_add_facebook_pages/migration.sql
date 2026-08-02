-- CreateTable
CREATE TABLE "FacebookConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fbUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacebookConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FacebookPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "targetId" TEXT,
    "adminAccountId" TEXT,
    "tokenValid" BOOLEAN NOT NULL DEFAULT true,
    "tokenCheckedAt" DATETIME,
    "tokenNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FacebookPage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FacebookConnection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FacebookPage_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FacebookPage_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FacebookConnection_fbUserId_key" ON "FacebookConnection"("fbUserId");

-- CreateIndex
CREATE INDEX "FacebookConnection_accountId_idx" ON "FacebookConnection"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPage_pageId_key" ON "FacebookPage"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "FacebookPage_targetId_key" ON "FacebookPage"("targetId");

-- CreateIndex
CREATE INDEX "FacebookPage_connectionId_idx" ON "FacebookPage"("connectionId");
