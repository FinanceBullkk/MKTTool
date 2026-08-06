-- CreateTable
CREATE TABLE "ScheduledJobRun" (
    "key" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "host" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("key")
);
