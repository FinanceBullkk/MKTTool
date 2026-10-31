/*
  Warnings:

  - You are about to drop the `ContentItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FacebookConnection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FacebookPage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HealthCheck` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HealthCheckLock` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Interaction` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ObserverProxy` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PlatformTarget` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PostJob` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `RuleConfig` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ScheduledJobRun` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "FacebookConnection" DROP CONSTRAINT "FacebookConnection_accountId_fkey";

-- DropForeignKey
ALTER TABLE "FacebookPage" DROP CONSTRAINT "FacebookPage_adminAccountId_fkey";

-- DropForeignKey
ALTER TABLE "FacebookPage" DROP CONSTRAINT "FacebookPage_connectionId_fkey";

-- DropForeignKey
ALTER TABLE "FacebookPage" DROP CONSTRAINT "FacebookPage_targetId_fkey";

-- DropForeignKey
ALTER TABLE "HealthCheck" DROP CONSTRAINT "HealthCheck_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Interaction" DROP CONSTRAINT "Interaction_accountId_fkey";

-- DropForeignKey
ALTER TABLE "Interaction" DROP CONSTRAINT "Interaction_targetId_fkey";

-- DropForeignKey
ALTER TABLE "PostJob" DROP CONSTRAINT "PostJob_accountId_fkey";

-- DropForeignKey
ALTER TABLE "PostJob" DROP CONSTRAINT "PostJob_contentItemId_fkey";

-- DropForeignKey
ALTER TABLE "PostJob" DROP CONSTRAINT "PostJob_targetId_fkey";

-- DropTable
DROP TABLE "ContentItem";

-- DropTable
DROP TABLE "FacebookConnection";

-- DropTable
DROP TABLE "FacebookPage";

-- DropTable
DROP TABLE "HealthCheck";

-- DropTable
DROP TABLE "HealthCheckLock";

-- DropTable
DROP TABLE "Interaction";

-- DropTable
DROP TABLE "ObserverProxy";

-- DropTable
DROP TABLE "PlatformTarget";

-- DropTable
DROP TABLE "PostJob";

-- DropTable
DROP TABLE "RuleConfig";

-- DropTable
DROP TABLE "ScheduledJobRun";
