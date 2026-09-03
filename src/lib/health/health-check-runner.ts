/**
 * Điều phối một lượt dò sức khỏe: lấy proxy quan sát viên, chạy lần lượt từng nick, ghi kết quả.
 *
 * Hai điều quan trọng hơn tốc độ:
 *
 *  1. **Chạy lần lượt, giãn ngẫu nhiên 30-90 giây.** Tám lượt xem profile bắn ra trong ba giây
 *     từ một IP là hành vi của máy, và chính bộ dò sẽ là thứ bị chặn trước tiên. Chậm mà dò
 *     được 8 nick vẫn hơn nhanh rồi mù cả tháng.
 *  2. **Một nick hỏng không làm hỏng cả lượt.** Lỗi của từng nick được ghi lại thành bản ghi
 *     ERROR rồi đi tiếp — dò 8 nick mà nick thứ hai làm sập cả lượt là 6 nick còn lại không
 *     ai biết ra sao.
 */
import { prisma } from "@/lib/db/prisma-client";
import { autoLinkDiscoveredPosts } from "./auto-link-discovered-posts";
import { type HeldLock, acquireHealthCheckLock } from "./health-check-lock";
import {
  type AccountToCheck,
  countExpectedPosts,
  hasEverSeenProfile,
  loadRecordedPostKeys,
  recordHealthCheck,
} from "./health-check-recorder";
import type { HealthVerdict } from "./health-verdict";
import { type ObserverSession, openObserverSession } from "./observer-browser-session";
import { OBSERVATION_WINDOW_DAYS, probeRedditAccount } from "./reddit-shadowban-prober";
import { pruneOldScreenshots } from "./screenshot-retention";

/** Giãn ngẫu nhiên giữa hai nick. Xem lý do ở đầu file. */
export const DEFAULT_SPACING = { minMs: 30_000, maxMs: 90_000 } as const;

export class HealthCheckSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthCheckSetupError";
  }
}

export interface HealthCheckRunOptions {
  /** Chỉ dò những nick này. Bỏ trống = dò mọi nick Reddit chưa chết. */
  accountIds?: readonly string[];
  /** Đặt `{ minMs: 0, maxMs: 0 }` để chạy liền mạch trong test hoặc khi dò đúng một nick. */
  spacing?: { minMs: number; maxMs: number };
  now?: Date;
  /** Nhận từng dòng tiến độ — script in ra màn hình, route API thì bỏ qua. */
  onProgress?: (line: string) => void;
  /** Bơm phiên trình duyệt sẵn có, dùng cho kiểm chứng tay. */
  session?: ObserverSession;
}

export interface HealthCheckRunResult {
  checked: number;
  byVerdict: Partial<Record<HealthVerdict | string, number>>;
  statusChanges: { username: string; to: string }[];
  /** Số bài bộ dò tự gán vào job trong lượt này — thứ đáng nói nhất với người vừa đăng xong. */
  autoLinked: number;
  /** Bài lạ không tự gán được vì HTML thiếu link/tên sub — xem `ProbeResult.unlinkablePosts`. */
  unlinkable: number;
  durationMs: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSpacingMs(spacing: { minMs: number; maxMs: number }): number {
  if (spacing.maxMs <= spacing.minMs) return Math.max(0, spacing.minMs);
  return spacing.minMs + Math.floor(Math.random() * (spacing.maxMs - spacing.minMs));
}

/**
 * Proxy quan sát viên đang bật. Không có thì DỪNG cả lượt — dò bằng IP nhà hoặc bằng chính
 * proxy của nick là tự nối bộ dò với đàn nick, đúng thứ nó sinh ra để tránh.
 */
async function loadObserverProxy() {
  const proxy = await prisma.observerProxy.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
  });

  if (!proxy) {
    throw new HealthCheckSetupError(
      "No observer proxy is enabled. Add a dedicated proxy on /proxies. " +
        "Never use that proxy to sign in to any nick, even once.",
    );
  }

  return proxy;
}

function loadAccounts(accountIds?: readonly string[]): Promise<AccountToCheck[]> {
  return prisma.account.findMany({
    where: {
      platform: "REDDIT",
      status: { not: "DEAD" },
      ...(accountIds?.length ? { id: { in: [...accountIds] } } : {}),
    },
    select: { id: true, username: true, status: true },
    orderBy: { username: "asc" },
  });
}

export async function runHealthCheck(
  options: HealthCheckRunOptions = {},
): Promise<HealthCheckRunResult> {
  const {
    accountIds,
    spacing = DEFAULT_SPACING,
    now = new Date(),
    onProgress = () => {},
    session: providedSession,
  } = options;

  const startedAt = Date.now();

  // Giành khóa TRƯỚC mọi thứ khác. Hai lượt chạy chồng nhau làm proxy quan sát viên bắn
  // request dồn dập và bị Reddit chặn — xem đầu health-check-lock.ts.
  const lock = await acquireHealthCheckLock({ now });

  try {
    const proxy = await loadObserverProxy();
    const accounts = await loadAccounts(accountIds);

    if (accounts.length === 0) {
      onProgress("There are no Reddit nicks to check.");
      return {
        checked: 0,
        byVerdict: {},
        statusChanges: [],
        autoLinked: 0,
        unlinkable: 0,
        durationMs: Date.now() - startedAt,
      };
    }

    onProgress(
      `Checking ${accounts.length} nicks through observer proxy "${proxy.label}" (${proxy.country}).`,
    );

    return await probeAll({
      accounts,
      proxy,
      providedSession,
      spacing,
      now,
      onProgress,
      startedAt,
      lock,
    });
  } finally {
    await lock.release();
  }
}

/** Vòng dò chính. Tách khỏi `runHealthCheck` để phần giành/thả khóa đọc được trong một màn hình. */
async function probeAll(input: {
  accounts: AccountToCheck[];
  proxy: Parameters<typeof openObserverSession>[0];
  providedSession?: ObserverSession;
  spacing: { minMs: number; maxMs: number };
  now: Date;
  onProgress: (line: string) => void;
  startedAt: number;
  lock: HeldLock;
}): Promise<HealthCheckRunResult> {
  const { accounts, proxy, providedSession, spacing, now, onProgress, startedAt, lock } = input;

  const session = providedSession ?? (await openObserverSession(proxy));
  const byVerdict: Partial<Record<string, number>> = {};
  const statusChanges: { username: string; to: string }[] = [];
  let autoLinked = 0;
  let unlinkable = 0;

  try {
    for (const [index, account] of accounts.entries()) {
      let verdict = "ERROR";

      try {
        const [expectedPosts, profileSeenBefore, recordedPostKeys] = await Promise.all([
          countExpectedPosts(account.id, OBSERVATION_WINDOW_DAYS, now),
          hasEverSeenProfile(account.id),
          loadRecordedPostKeys(account.id, OBSERVATION_WINDOW_DAYS, now),
        ]);
        const result = await probeRedditAccount(session, {
          username: account.username,
          expectedPosts,
          now,
          profileSeenBefore,
          recordedPostKeys,
          // Bài lạ được gán vào kho NGAY TRONG lượt dò, trước lúc kết luận — xem lý do ở
          // `resolveUntracked` trong reddit-shadowban-prober.ts.
          resolveUntracked: async (posts) => {
            const outcome = await autoLinkDiscoveredPosts(account.id, posts);
            for (const line of outcome.lines) onProgress(`  ${account.username}: ${line}`);
            for (const item of outcome.ambiguous) {
              onProgress(
                `  ${account.username}: did not link ${item.post.threadKey} - ${item.reason}`,
              );
            }
            return outcome.linkedKeys;
          },
        });
        const recorded = await recordHealthCheck(account, result, now);

        verdict = recorded.verdict;
        onProgress(`  ${account.username}: ${verdict} — ${result.evaluation.detail}`);
        autoLinked += result.autoLinkedKeys.length;

        // Nói ra chứ không nuốt: đây là dấu hiệu Reddit đổi markup, và nếu im lặng thì triệu
        // chứng duy nhất là bộ dò ngừng gán được bài mà không ai biết vì sao.
        if (result.unlinkablePosts > 0) {
          unlinkable += result.unlinkablePosts;
          onProgress(
            `  ${account.username}: ${result.unlinkablePosts} unrecognized posts could not be linked automatically because ` +
              `the HTML contained no permalink or subreddit name. Reddit likely changed its page structure.`,
          );
        }

        if (recorded.statusChangedTo) {
          statusChanges.push({ username: account.username, to: recorded.statusChangedTo });
          onProgress(
            `  -> Nick status changed to ${recorded.statusChangedTo}; all of its jobs are now blocked.`,
          );
        }
      } catch (error) {
        // Lỗi ngoài dự tính (mất kết nối database, đĩa đầy…). Ghi lại rồi đi tiếp.
        const reason = error instanceof Error ? error.message : String(error);
        onProgress(`  ${account.username}: ERROR — ${reason}`);
      }

      byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;

      // Đập nhịp sau MỖI nick, kể cả nick vừa lỗi: nhịp tim nói "tiến trình còn sống", không nói
      // "nick vừa rồi ổn". Đây là thứ giữ cho một lượt dò đàn lớn không bị lượt sau tưởng là đã
      // chết rồi chen vào chạy song song — xem STALE_AFTER_MS ở health-check-lock.ts.
      await lock.renew();

      const isLast = index === accounts.length - 1;
      if (!isLast) {
        const waitMs = randomSpacingMs(spacing);
        if (waitMs > 0) {
          onProgress(`  ... waiting ${Math.round(waitMs / 1000)} seconds before the next nick`);
          await sleep(waitMs);
        }
      }
    }
  } finally {
    if (!providedSession) await session.close();
  }

  // Dọn ảnh cũ ở cuối lượt: thư mục ảnh không bao giờ tự nhỏ lại, và đây là chỗ duy nhất chắc
  // chắn chạy đều đặn. Dọn hỏng thì KHÔNG được làm hỏng kết quả dò — đó mới là thứ đáng giá.
  try {
    const pruned = await pruneOldScreenshots({ now });
    if (pruned.deleted > 0) onProgress(`Removed ${pruned.deleted} expired screenshots.`);
  } catch (error) {
    onProgress(
      `Could not remove old screenshots: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    checked: accounts.length,
    byVerdict,
    statusChanges,
    autoLinked,
    unlinkable,
    durationMs: Date.now() - startedAt,
  };
}
