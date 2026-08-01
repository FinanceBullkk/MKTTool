-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "contentAngle" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Proxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STATIC_ISP',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ObserverProxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "emailPasswordEnc" TEXT NOT NULL,
    "totpSecretEnc" TEXT,
    "antidetectProfileId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "proxyId" TEXT NOT NULL,
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
    CONSTRAINT "Account_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "Proxy" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "minKarma" INTEGER NOT NULL DEFAULT 0,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 0,
    "promoRatio" INTEGER NOT NULL DEFAULT 9,
    "allowsLinks" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "Persona_name_key" ON "Persona"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Proxy_label_key" ON "Proxy"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Proxy_host_port_username_key" ON "Proxy"("host", "port", "username");

-- CreateIndex
CREATE UNIQUE INDEX "ObserverProxy_label_key" ON "ObserverProxy"("label");

-- CreateIndex
CREATE UNIQUE INDEX "Account_antidetectProfileId_key" ON "Account"("antidetectProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_proxyId_key" ON "Account"("proxyId");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Account_platform_username_key" ON "Account"("platform", "username");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformTarget_platform_name_key" ON "PlatformTarget"("platform", "name");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_idx" ON "AuditLog"("accountId");
