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
      title: "Cài cầu nối và đăng ký máy",
      state: devices > 0 ? "done" : "todo",
      status: plural(devices, "máy đang dùng", "chưa máy nào đăng ký"),
      why: "Chưa có nó thì không lấy được mật khẩu, không mở được profile, và không tạo nổi một nick có bí mật.",
      href: "/relay-devices",
      linkLabel: "Mở sổ đăng ký máy",
    },
    {
      id: "proxies",
      title: "Mua và nhập proxy",
      state: proxies > 0 ? "done" : "todo",
      status: plural(proxies, "proxy trong kho", "chưa có proxy nào"),
      why: "Mua proxy TRƯỚC khi mua nick — đăng nhập nick cổ từ IP sai quốc gia là cách phổ biến nhất để đốt tiền.",
      href: "/proxies",
      linkLabel: "Nhập proxy",
      adminOnly: true,
    },
    {
      id: "observer",
      title: "Thêm proxy quan sát viên",
      state: observerProxies > 0 ? "done" : "todo",
      status: plural(observerProxies, "proxy quan sát viên đang bật", "chưa có"),
      why: "Bộ dò shadowban nhìn nick bằng con mắt người ngoài. Phải là IP riêng, khác nhà cung cấp với proxy của nick.",
      href: "/proxies",
      linkLabel: "Thêm proxy quan sát viên",
      adminOnly: true,
    },
    {
      id: "accounts",
      title: "Nhập nick",
      state: accounts.length > 0 ? "done" : "todo",
      status: plural(accounts.length, "nick trong kho", "chưa có nick nào"),
      why: "Gắn proxy, ghi giọng viết cho từng nick, đặt cold-start 14 ngày.",
      href: "/accounts",
      linkLabel: "Thêm nick",
    },
    {
      id: "clusters",
      title: "Phân công cụm cho từng nick",
      // Chưa gán được cái nào thì là CHƯA LÀM, không phải "đang dở" — "đang dở" nói rằng đã bắt
      // đầu, và người đọc sẽ đi tìm xem mình đã làm tới đâu trong khi chưa có gì để tìm.
      state: clustered === 0 ? "todo" : clustered === accounts.length ? "done" : "partial",
      status:
        accounts.length === 0
          ? "chưa có nick nào để phân công"
          : `${clustered}/${accounts.length} nick đã gán chủ và máy`,
      why: "Id profile antidetect chỉ có nghĩa trên đúng chiếc máy tạo ra nó, nên kho phải biết máy nào giữ nick nào.",
      href: "/accounts",
      linkLabel: "Xem nick nào còn thiếu",
      adminOnly: true,
    },
    {
      id: "targets",
      title: "Khai đích đăng",
      state: targets > 0 ? "done" : "todo",
      status: plural(targets, "đích đang dùng", "chưa có đích nào"),
      why: "Subreddit kèm luật thật của sub đó — karma tối thiểu, tuổi nick, cho link hay không.",
      href: "/targets",
      linkLabel: "Thêm đích đăng",
    },
    {
      id: "content",
      title: "Nhập content",
      state: contentCount > 0 ? "done" : "todo",
      status: plural(contentCount, "bài trong kho", "chưa có bài nào"),
      why: "Bài phải nằm trong kho thì bộ luật mới so trùng nội dung được.",
      href: "/content",
      linkLabel: "Thêm content",
    },
    {
      id: "queue",
      title: "Xếp lịch bài đầu tiên",
      state: jobCount > 0 ? "done" : "todo",
      status: plural(jobCount, "job đã tạo", "chưa xếp lịch bài nào"),
      why: "Bộ luật chấm trước khi cho lưu, nên job đầu tiên cũng là lượt kiểm chứng cả chuỗi phía trên.",
      href: "/queue/new",
      linkLabel: "Xếp lịch bài",
    },
  ];

  const next = steps.find((step) => step.state !== "done");

  return {
    steps,
    nextStepId: next?.id ?? null,
    doneCount: steps.filter((step) => step.state === "done").length,
  };
}
