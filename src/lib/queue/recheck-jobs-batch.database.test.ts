import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostJob } from "@prisma/client";
import type { PreviewResult } from "./post-job-rule-preview";

vi.mock("./post-job-rule-preview", () => ({ previewPostJobRules: vi.fn() }));

const { prisma } = await import("@/lib/db/prisma-client");
const { previewPostJobRules } = await import("./post-job-rule-preview");
const { recheckOneJob, recheckJobsMatching } = await import("./recheck-jobs-batch");
const allowed: PreviewResult = {
  ok: true,
  evaluation: { level: "ALLOW", results: [], blocks: [], warnings: [], skipped: [], overridable: true },
};
let job: PostJob;

beforeEach(async () => {
  const id = randomUUID();
  job = await prisma.postJob.create({
    data: {
      scheduledAt: new Date(),
      ruleVerdicts: "original-verdict",
      account: {
        create: {
          platform: "FACEBOOK", username: `recheck-${id}`, status: "ALIVE",
          emailAddress: `${id}@example.test`, emailPasswordEnc: "test-fixture",
        },
      },
      target: { create: { platform: "FACEBOOK_PAGE", name: `recheck-${id}`, url: "https://example.test/page" } },
      contentItem: { create: { title: "Recheck test", body: "Test content", type: "VALUE", authorName: "Test" } },
    },
  });
  vi.mocked(previewPostJobRules).mockReset().mockResolvedValue(allowed);
});

afterEach(async () => {
  await prisma.postJob.deleteMany({ where: { id: job.id } });
  await prisma.account.delete({ where: { id: job.accountId } });
  await prisma.platformTarget.delete({ where: { id: job.targetId } });
  await prisma.contentItem.delete({ where: { id: job.contentItemId } });
});
afterAll(() => prisma.$disconnect());

describe("recheck preserves a job that leaves the open queue", () => {
  it.each(["POSTED", "PUBLISHING", "SKIPPED", "FAILED"])(
    "does not overwrite %s while evaluation is in progress",
    async (status) => {
      const entered = Promise.withResolvers<void>();
      const evaluation = Promise.withResolvers<PreviewResult>();
      vi.mocked(previewPostJobRules).mockImplementationOnce(() => {
        entered.resolve();
        return evaluation.promise;
      });
      const checking = recheckOneJob(job);
      await entered.promise;
      await prisma.postJob.update({ where: { id: job.id }, data: { status } });
      evaluation.resolve(allowed);

      await expect(checking).resolves.toMatchObject({ ok: false, message: expect.stringContaining("changed") });
      expect(await prisma.postJob.findUniqueOrThrow({ where: { id: job.id } }))
        .toMatchObject({ status, ruleVerdicts: "original-verdict" });
    },
  );

  it("reports a raced batch entry as failed instead of throwing", async () => {
    vi.mocked(previewPostJobRules).mockImplementationOnce(async () => {
      await prisma.postJob.update({ where: { id: job.id }, data: { status: "POSTED" } });
      return allowed;
    });
    await expect(recheckJobsMatching({ id: job.id })).resolves.toEqual({ checked: 0, blocked: 0, failed: 1 });
  });

  it("still stores a completed evaluation for a pending job", async () => {
    await expect(recheckOneJob(job)).resolves.toMatchObject({ ok: true, blocked: false });
    const stored = await prisma.postJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.status).toBe("PENDING");
    expect(stored.ruleVerdicts).not.toBe("original-verdict");
  });
});
