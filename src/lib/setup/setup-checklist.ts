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

export interface SetupChecklistSection {
  steps: SetupStep[];
  /** Bước đầu tiên chưa xong — thứ trang này highlight. `null` khi đã đủ. */
  nextStepId: string | null;
  doneCount: number;
}

export interface SetupChecklist {
  /** Các bước đủ để bàn giao kho danh tính, không phụ thuộc pipeline đăng bài. */
  handoff: SetupChecklistSection;
}

function plural(count: number, unit: string, empty: string): string {
  return count === 0 ? empty : `${count} ${unit}`;
}

function summarize(steps: SetupStep[]): SetupChecklistSection {
  const next = steps.find((step) => step.state !== "done");
  return {
    steps,
    nextStepId: next?.id ?? null,
    doneCount: steps.filter((step) => step.state === "done").length,
  };
}

export async function loadSetupChecklist(): Promise<SetupChecklist> {
  const [devices, proxies, accounts] =
    await Promise.all([
      prisma.relayDevice.count({ where: { revokedAt: null } }),
      prisma.proxy.count(),
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
    ]);

  // Một nick chỉ tính là "gán cụm xong" khi không còn chặn nào thuộc nhóm cụm. Đếm theo phép
  // chấm chung chứ không đếm `ownerId != null` — hai chỗ đếm khác nhau thì sớm muộn lệch nhau.
  const clustered = accounts.filter((account) => {
    const codes = describeAccountReadiness(account).blockers.map((blocker) => blocker.code);
    return !codes.some((code) => ["NO_OWNER", "NO_DEVICE", "DEVICE_REVOKED", "CLUSTER_DRIFT"].includes(code));
  }).length;

  const handoffSteps: SetupStep[] = [
    {
      id: "relay",
      title: "Register team Relay PCs",
      state: devices > 0 ? "done" : "todo",
      status: plural(devices, "active Relay PCs", "No active Relay PC is registered"),
      why: "A registered Relay PC is required before a managed browser profile can be opened; remaining identity, network, and operator gates still apply.",
      href: "/relay-devices",
      linkLabel: "Open the Relay PC registry",
    },
    {
      id: "proxies",
      title: "Buy and import proxies",
      state: proxies > 0 ? "done" : "todo",
      status: plural(proxies, "proxies in the workspace", "No proxies have been imported"),
      why: "Buy proxies before nicks so an established nick is never first opened from the wrong country.",
      href: "/proxies",
      linkLabel: "Import proxies",
      adminOnly: true,
    },
    {
      id: "accounts",
      title: "Add nicks",
      state: accounts.length > 0 ? "done" : "todo",
      status: plural(accounts.length, "active nicks", "No active nicks"),
      why: "Each nick needs its proxy, writing voice, and cold-start period recorded before use.",
      href: "/accounts",
      linkLabel: "Add a nick",
    },
    {
      id: "clusters",
      title: "Assign each nick to an owner and Relay PC",
      // Chưa gán được cái nào thì là CHƯA LÀM, không phải "đang dở" — "đang dở" nói rằng đã bắt
      // đầu, và người đọc sẽ đi tìm xem mình đã làm tới đâu trong khi chưa có gì để tìm.
      state: clustered === 0 ? "todo" : clustered === accounts.length ? "done" : "partial",
      status:
        accounts.length === 0
          ? "No nicks are available to assign"
          : `${clustered}/${accounts.length} nicks have an owner and Relay PC`,
      why: "A browser profile ID is local to the Relay PC that created it, so every nick needs one stable owner and Relay PC; this does not prove identity isolation.",
      href: "/accounts",
      linkLabel: "Review incomplete nicks",
      adminOnly: true,
    },
  ];

  return {
    handoff: summarize(handoffSteps),
  };
}
