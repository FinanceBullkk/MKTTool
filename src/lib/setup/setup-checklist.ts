/**
 * **Dựng kho tới đâu rồi** — nguồn dữ liệu cho trang `/setup`.
 *
 * ## Vì sao cần một trang riêng cho việc này
 *
 * Trang Hôm nay là bảng vận hành **hằng ngày**: bài phải đăng, nick cần xử lý, sức khỏe đàn nick.
 * Dựng kho là việc làm **một lần** nhưng làm sai thì hỏng lâu, và nó có thứ tự bắt buộc. Trước
 * khi có file này, hướng dẫn duy nhất trong cả app là một dòng chữ xám nằm trong thẻ *Sức khỏe
 * đàn nick* — sai chỗ, không có link, nêu 3 trên 8 bước, và biến mất ngay khi có nick đầu tiên,
 * đúng lúc còn 5 bước chưa làm. Thứ tự đầy đủ chỉ tồn tại trong README, mà README thì chỉ người
 * cài máy chủ đọc.
 *
 * ## Thứ tự các bước là ràng buộc thật, không phải gợi ý
 *
 * Cầu nối đứng đầu vì chưa có nó thì không tạo nổi một nick có bí mật. Proxy đứng trước nick vì
 * đăng nhập nick cổ từ IP sai quốc gia là cách phổ biến nhất để đốt tiền. Phân công cụm đứng
 * ngay sau nick vì id profile antidetect chỉ có nghĩa trên đúng chiếc máy tạo ra nó.
 *
 * Mỗi bước tự đọc trạng thái từ kho, nên trang này **không bao giờ nói sai** về việc đã làm tới
 * đâu — khác một danh sách viết cứng trong tài liệu.
 */
import { prisma } from "@/lib/db/prisma-client";
import { describeAccountReadiness } from "@/lib/accounts/account-readiness";

export type SetupStepState = "done" | "todo" | "partial";

export interface SetupStep {
  /** Khóa ổn định — dùng làm `key` lúc vẽ và làm mỏ neo trong test. */
  id: string;
  title: string;
  state: SetupStepState;
  /** Sự thật đọc từ kho: "3 proxy trong kho", "chưa có nick nào". */
  status: string;
  /** Vì sao bước này đứng ở đây. Một câu, không phải đoạn văn. */
  why: string;
  href: string;
  linkLabel: string;
  /** Chỉ quản trị viên làm được bước này. */
  adminOnly?: boolean;
}

export interface SetupChecklist {
  steps: SetupStep[];
  /** Bước đầu tiên chưa xong — thứ trang này highlight. `null` khi đã đủ. */
  nextStepId: string | null;
  doneCount: number;
}

function plural(count: number, unit: string, empty: string): string {
  return count === 0 ? empty : `${count} ${unit}`;
}

export async function loadSetupChecklist(): Promise<SetupChecklist> {
  const [devices, proxies, observerProxies, accounts, targets, contentCount, jobCount] =
    await Promise.all([
      prisma.relayDevice.count({ where: { revokedAt: null } }),
      prisma.proxy.count(),
      prisma.observerProxy.count({ where: { active: true } }),
      prisma.account.findMany({
        where: { status: { not: "DEAD" } },
        select: {
          platform: true,
          status: true,
          coldStartUntil: true,
          voice: true,
          antidetectProfileId: true,
          firstLoginAt: true,
          ownerId: true,
          proxy: { select: { lastCheckVerdict: true } },
          device: { select: { userId: true, revokedAt: true } },
        },
      }),
      prisma.platformTarget.count({ where: { active: true } }),
      prisma.contentItem.count(),
      prisma.postJob.count(),
    ]);

  // Một nick chỉ tính là "gán cụm xong" khi không còn chặn nào thuộc nhóm cụm. Đếm theo phép
  // chấm chung chứ không đếm `ownerId != null` — hai chỗ đếm khác nhau thì sớm muộn lệch nhau.
  const clustered = accounts.filter((account) => {
    const codes = describeAccountReadiness(account).blockers.map((blocker) => blocker.code);
    return !codes.some((code) => ["NO_OWNER", "NO_DEVICE", "DEVICE_REVOKED", "CLUSTER_DRIFT"].includes(code));
  }).length;

  const steps: SetupStep[] = [
    {
      id: "relay",
      title: "Install MKTTool on team PCs",
      state: devices > 0 ? "done" : "todo",
      status: plural(devices, "active PCs", "No active PC is registered"),
      why: "A registered PC is required before a managed launch can be attempted; remaining identity, network, and operator gates still apply.",
      href: "/relay-devices",
      linkLabel: "Open the device registry",
    },
    {
      id: "proxies",
      title: "Buy and import proxies",
      state: proxies > 0 ? "done" : "todo",
      status: plural(proxies, "proxies in the workspace", "No proxies have been imported"),
      why: "Buy proxies before accounts so an established account is never first opened from the wrong country.",
      href: "/proxies",
      linkLabel: "Import proxies",
      adminOnly: true,
    },
    {
      id: "observer",
      title: "Add an observer proxy",
      state: observerProxies > 0 ? "done" : "todo",
      status: plural(observerProxies, "active observer proxies", "No active observer proxy"),
      why: "Shadowban checks need an outsider view through a separate IP and provider from account proxies.",
      href: "/proxies",
      linkLabel: "Add an observer proxy",
      adminOnly: true,
    },
    {
      id: "accounts",
      title: "Add accounts",
      state: accounts.length > 0 ? "done" : "todo",
      status: plural(accounts.length, "active accounts", "No active accounts"),
      why: "Each account needs its proxy, writing voice, and cold-start period recorded before use.",
      href: "/accounts",
      linkLabel: "Add an account",
    },
    {
      id: "clusters",
      title: "Assign each account to an owner and PC",
      // Chưa gán được cái nào thì là CHƯA LÀM, không phải "đang dở" — "đang dở" nói rằng đã bắt
      // đầu, và người đọc sẽ đi tìm xem mình đã làm tới đâu trong khi chưa có gì để tìm.
      state: clustered === 0 ? "todo" : clustered === accounts.length ? "done" : "partial",
      status:
        accounts.length === 0
          ? "No accounts are available to assign"
          : `${clustered}/${accounts.length} accounts have an owner and PC`,
      why: "A profile ID is local to the PC that created it, so every account needs one stable owner and PC; this does not prove identity isolation.",
      href: "/accounts",
      linkLabel: "Review incomplete accounts",
      adminOnly: true,
    },
    {
      id: "targets",
      title: "Add publishing targets",
      state: targets > 0 ? "done" : "todo",
      status: plural(targets, "active targets", "No active targets"),
      why: "Each subreddit needs its real posting rules, including karma, account age, and link limits.",
      href: "/targets",
      linkLabel: "Add a target",
    },
    {
      id: "content",
      title: "Add content",
      state: contentCount > 0 ? "done" : "todo",
      status: plural(contentCount, "content items", "No content items"),
      why: "Content must be in the workspace before safety rules can detect duplicate text.",
      href: "/content",
      linkLabel: "Add content",
    },
    {
      id: "queue",
      title: "Schedule the first post",
      state: jobCount > 0 ? "done" : "todo",
      status: plural(jobCount, "scheduled jobs", "No post has been scheduled"),
      why: "The first scheduled job verifies the complete setup because safety rules run before it can be saved.",
      href: "/queue/new",
      linkLabel: "Schedule a post",
    },
  ];

  const next = steps.find((step) => step.state !== "done");

  return {
    steps,
    nextStepId: next?.id ?? null,
    doneCount: steps.filter((step) => step.state === "done").length,
  };
}
