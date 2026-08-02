-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" TEXT NOT NULL,
    "shadowbanned" BOOLEAN NOT NULL DEFAULT false,
    "karma" INTEGER,
    "visiblePosts" INTEGER,
    "expectedPosts" INTEGER,
    "detail" TEXT,
    "screenshotPath" TEXT,
    CONSTRAINT "HealthCheck_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ObserverProxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ObserverProxy" ("active", "country", "createdAt", "host", "id", "label", "passwordEnc", "port", "username") SELECT "active", "country", "createdAt", "host", "id", "label", "passwordEnc", "port", "username" FROM "ObserverProxy";
DROP TABLE "ObserverProxy";
ALTER TABLE "new_ObserverProxy" RENAME TO "ObserverProxy";
CREATE UNIQUE INDEX "ObserverProxy_label_key" ON "ObserverProxy"("label");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "HealthCheck_accountId_checkedAt_idx" ON "HealthCheck"("accountId", "checkedAt");

-- CreateIndex
CREATE INDEX "HealthCheck_checkedAt_idx" ON "HealthCheck"("checkedAt");
