/**
 * Lắp RuleContext cho bộ luật.
 *
 * Cùng với rule-context-queries.ts, đây là nơi DUY NHẤT trong bộ luật chạm vào database.
 * Mọi thứ trả về là object thuần để 10 luật kia giữ được tính thuần túy và test được
 * mà không cần database.
 */
import { type ContentType, isContentType, parseLinks } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { isPlatformCompatible } from "@/lib/platforms/platform-family";
import {
  countPostsSameDay,
  hoursToNearestSameTarget,
  loadComparableContent,
  loadLatestHealthCheck,
  loadOwnJobs,
  loadSameTargetNeighbors,
  loadThreadCollisions,
  tallyPromoRatio,
} from "./rule-context-queries";
import { extractUrls } from "./rule-link-policy";
import { applyThresholdOverrides } from "./rule-thresholds";
import { normalizeThreadUrl } from "./rule-thread-collision";
import type { RuleContext } from "./rule-types";
import { combineContentText } from "./text-normalizer";

/** Content lấy từ kho (contentItemId) hoặc gõ trực tiếp để xem thử. */
export type ContentSource =
  | { contentItemId: string }
  | { draft: { type: ContentType; title: string; body: string; links: string[] } };

export interface BuildRuleContextInput {
  accountId: string;
  targetId: string;
  content: ContentSource;
  scheduledAt: Date;
  /** Chỉ có khi đang ghi một tương tác vào thread cụ thể. */
  threadUrl?: string | null;
  /** Bỏ qua chính job đang được kiểm tra lại, nếu không nó sẽ tự so với chính mình. */
  excludeJobId?: string;
}

export type BuildRuleContextResult =
  | { ok: true; ctx: RuleContext }
  | { ok: false; message: string };

export async function buildRuleContext(
  input: BuildRuleContextInput,
): Promise<BuildRuleContextResult> {
  const at = input.scheduledAt;

  const [account, target, thresholdRows] = await Promise.all([
    prisma.account.findUnique({ where: { id: input.accountId } }),
    prisma.platformTarget.findUnique({ where: { id: input.targetId } }),
    prisma.ruleConfig.findMany(),
  ]);

  if (!account) return { ok: false, message: "Không tìm thấy nick." };
  if (!target) return { ok: false, message: "Không tìm thấy đích đăng." };
  if (!isPlatformCompatible(account.platform, target.platform)) {
    return {
      ok: false,
      message: `Nick ${account.platform} không đăng được lên đích ${target.platform}.`,
    };
  }

  const content = await resolveContent(input.content);
  if (!content) return { ok: false, message: "Không tìm thấy content." };

  const thresholds = applyThresholdOverrides(thresholdRows);
  const threadKey = input.threadUrl ? normalizeThreadUrl(input.threadUrl) : null;

  const [
    ownJobs,
    recentContentSamePlatform,
    threadCollisions,
    sameTargetNeighbors,
    latestHealthCheck,
  ] = await Promise.all([
    loadOwnJobs(input.accountId, input.excludeJobId),
    loadComparableContent(target.platform, at, thresholds.similarityWindowDays, input.excludeJobId),
    loadThreadCollisions(threadKey, input.accountId),
    loadSameTargetNeighbors(
      input.targetId,
      input.accountId,
      at,
      thresholds.threadCollisionWarnHours,
      input.excludeJobId,
    ),
    loadLatestHealthCheck(input.accountId),
  ]);

  return {
    ok: true,
    ctx: {
      at,
      account: {
        id: account.id,
        username: account.username,
        platform: account.platform,
        status: account.status,
        karma: account.karma,
        coldStartUntil: account.coldStartUntil,
        platformCreatedAt: account.platformCreatedAt,
      },
      target: {
        id: target.id,
        name: target.name,
        platform: target.platform,
        minKarma: target.minKarma,
        minAccountAgeDays: target.minAccountAgeDays,
        promoRatio: target.promoRatio,
        allowsLinks: target.allowsLinks,
      },
      content,
      postsSameDay: countPostsSameDay(ownJobs, at),
      hoursToNearestPostSameTarget: hoursToNearestSameTarget(ownJobs, input.targetId, at),
      promoTally: tallyPromoRatio(ownJobs, input.targetId),
      recentContentSamePlatform,
      threadCollisions,
      sameTargetNeighbors,
      latestHealthCheck,
      thresholds,
    },
  };
}

async function resolveContent(source: ContentSource): Promise<RuleContext["content"] | null> {
  if ("draft" in source) {
    return { ...source.draft, links: mergeLinks(source.draft) };
  }

  const item = await prisma.contentItem.findUnique({ where: { id: source.contentItemId } });
  if (!item) return null;

  // Dữ liệu lạ thì siết chặt: coi như PROMO để luật tỷ lệ 9:1 vẫn chạy.
  const type: ContentType = isContentType(item.type) ? item.type : "PROMO";

  return {
    type,
    title: item.title,
    body: item.body,
    links: mergeLinks({ title: item.title, body: item.body, links: parseLinks(item.links) }),
  };
}

/** Link khai ở ô riêng cộng link gõ thẳng trong bài — người viết hay quên khai. */
function mergeLinks(content: { title: string; body: string; links: string[] }): string[] {
  const found = extractUrls(combineContentText(content.title, content.body));
  return [...new Set([...content.links, ...found])];
}
