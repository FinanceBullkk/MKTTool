-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "voice" TEXT NOT NULL,
    "contentAngle" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proxy" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'STATIC_ISP',
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckVerdict" TEXT,
    "lastCheckDetail" TEXT,
    "lastExitIp" TEXT,
    "lastSpeedAt" TIMESTAMP(3),
    "lastSpeedMbps" DOUBLE PRECISION,
    "lastSpeedDetail" TEXT,

    CONSTRAINT "Proxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObserverProxy" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "protocol" TEXT NOT NULL DEFAULT 'http',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckVerdict" TEXT,
    "lastCheckDetail" TEXT,
    "lastExitIp" TEXT,

    CONSTRAINT "ObserverProxy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCheck" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" TEXT NOT NULL,
    "shadowbanned" BOOLEAN NOT NULL DEFAULT false,
    "karma" INTEGER,
    "visiblePosts" INTEGER,
    "expectedPosts" INTEGER,
    "detail" TEXT,
    "screenshotPath" TEXT,

    CONSTRAINT "HealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
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
    "coldStartUntil" TIMESTAMP(3),
    "platformCreatedAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "purchaseNote" TEXT,
    "lastActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTarget" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "minKarma" INTEGER NOT NULL DEFAULT 0,
    "minAccountAgeDays" INTEGER NOT NULL DEFAULT 0,
    "promoRatio" INTEGER NOT NULL DEFAULT 9,
    "allowsLinks" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "links" TEXT,
    "type" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostJob" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ruleVerdicts" TEXT,
    "overrideReason" TEXT,
    "postedUrl" TEXT,
    "errorMessage" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "threadUrl" TEXT NOT NULL,
    "threadKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "RuleConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "FacebookConnection" (
    "id" TEXT NOT NULL,
    "fbUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacebookPage" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "targetId" TEXT,
    "adminAccountId" TEXT,
    "tokenValid" BOOLEAN NOT NULL DEFAULT true,
    "tokenCheckedAt" TIMESTAMP(3),
    "tokenNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "HealthCheck_accountId_checkedAt_idx" ON "HealthCheck"("accountId", "checkedAt");

-- CreateIndex
CREATE INDEX "HealthCheck_checkedAt_idx" ON "HealthCheck"("checkedAt");

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

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_accountId_idx" ON "AuditLog"("accountId");

-- AddForeignKey
ALTER TABLE "HealthCheck" ADD CONSTRAINT "HealthCheck_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_proxyId_fkey" FOREIGN KEY ("proxyId") REFERENCES "Proxy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostJob" ADD CONSTRAINT "PostJob_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostJob" ADD CONSTRAINT "PostJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostJob" ADD CONSTRAINT "PostJob_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookConnection" ADD CONSTRAINT "FacebookConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "FacebookConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "PlatformTarget"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacebookPage" ADD CONSTRAINT "FacebookPage_adminAccountId_fkey" FOREIGN KEY ("adminAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
