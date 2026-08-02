-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Proxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STATIC_ISP',
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Proxy" ("country", "createdAt", "host", "id", "label", "notes", "passwordEnc", "port", "type", "username") SELECT "country", "createdAt", "host", "id", "label", "notes", "passwordEnc", "port", "type", "username" FROM "Proxy";
DROP TABLE "Proxy";
ALTER TABLE "new_Proxy" RENAME TO "Proxy";
CREATE UNIQUE INDEX "Proxy_label_key" ON "Proxy"("label");
CREATE UNIQUE INDEX "Proxy_host_port_username_key" ON "Proxy"("host", "port", "username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
