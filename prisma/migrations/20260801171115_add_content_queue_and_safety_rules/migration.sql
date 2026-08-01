-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "links" TEXT,
    "type" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PostJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ruleVerdicts" TEXT,
    "overrideReason" TEXT,
    "postedUrl" TEXT,
    "errorMessage" TEXT,
    "postedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostJob_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PostJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PostJob_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "threadUrl" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Interaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Interaction_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "ContentItem_createdAt_idx" ON "ContentItem"("createdAt");

-- CreateIndex
CREATE INDEX "PostJob_accountId_scheduledAt_idx" ON "PostJob"("accountId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PostJob_targetId_scheduledAt_idx" ON "PostJob"("targetId", "scheduledAt");

-- CreateIndex
CREATE INDEX "PostJob_status_idx" ON "PostJob"("status");

-- CreateIndex
CREATE INDEX "Interaction_threadKey_idx" ON "Interaction"("threadKey");

-- CreateIndex
CREATE INDEX "Interaction_accountId_at_idx" ON "Interaction"("accountId", "at");

-- CreateIndex
CREATE INDEX "Interaction_targetId_at_idx" ON "Interaction"("targetId", "at");
