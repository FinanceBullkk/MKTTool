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
import { acquireHealthCheckLock } from "./health-check-lock";
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
  /** Đổi chỗ đặt file khóa. Chỉ dùng trong test. */
  lockPath?: string;
}

export interface HealthCheckRunResult {
  checked: number;
  byVerdict: Partial<Record<HealthVerdict | string, number>>;
  statusChanges: { username: string; to: string }[];
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
      "Chưa có proxy quan sát viên nào đang bật. Thêm một proxy RIÊNG ở trang /proxies — " +
        "proxy này không bao giờ được dùng để đăng nhập nick nào, kể cả một lần.",
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
    lockPath,
  } = options;

  const startedAt = Date.now();

  // Giành khóa TRƯỚC mọi thứ khác. Hai lượt chạy chồng nhau làm proxy quan sát viên bắn
  // request dồn dập và bị Reddit chặn — xem đầu health-check-lock.ts.
  const lock = acquireHealthCheckLock({ lockPath, now });

  try {
    const proxy = await loadObserverProxy();
    const accounts = await loadAccounts(accountIds);

    if (accounts.length === 0) {
      onProgress("Không có nick Reddit nào để dò.");
      return { checked: 0, byVerdict: {}, statusChanges: [], durationMs: Date.now() - startedAt };
    }

    onProgress(
      `Dò ${accounts.length} nick qua proxy quan sát viên "${proxy.label}" (${proxy.country}).`,
    );

    return await probeAll({
      accounts,
      proxy,
      providedSession,
      spacing,
      now,
      onProgress,
      startedAt,
    });
  } finally {
    lock.release();
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
}): Promise<HealthCheckRunResult> {
  const { accounts, proxy, providedSession, spacing, now, onProgress, startedAt } = input;

  const session = providedSession ?? (await openObserverSession(proxy));
  const byVerdict: Partial<Record<string, number>> = {};
  const statusChanges: { username: string; to: string }[] = [];

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
        });
        const recorded = await recordHealthCheck(account, result, now);

        verdict = recorded.verdict;
        onProgress(`  ${account.username}: ${verdict} — ${result.evaluation.detail}`);

        if (recorded.statusChangedTo) {
          statusChanges.push({ username: account.username, to: recorded.statusChangedTo });
          onProgress(`  → trạng thái nick đổi sang ${recorded.statusChangedTo}, mọi job bị chặn.`);
        }
      } catch (error) {
        // Lỗi ngoài dự tính (mất kết nối database, đĩa đầy…). Ghi lại rồi đi tiếp.
        const reason = error instanceof Error ? error.message : String(error);
        onProgress(`  ${account.username}: ERROR — ${reason}`);
      }

      byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;

      const isLast = index === accounts.length - 1;
      if (!isLast) {
        const waitMs = randomSpacingMs(spacing);
        if (waitMs > 0) {
          onProgress(`  … nghỉ ${Math.round(waitMs / 1000)} giây trước nick tiếp theo`);
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
    if (pruned.deleted > 0) onProgress(`Đã dọn ${pruned.deleted} ảnh chụp quá hạn.`);
  } catch (error) {
    onProgress(`Không dọn được ảnh cũ: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    checked: accounts.length,
    byVerdict,
    statusChanges,
    durationMs: Date.now() - startedAt,
  };
}
