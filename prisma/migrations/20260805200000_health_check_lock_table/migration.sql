-- CreateTable
CREATE TABLE "HealthCheckLock" (
    "key" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthCheckLock_pkey" PRIMARY KEY ("key")
);
