/**
 * Nick chưa dùng được — dải cảnh báo ở trang **Hôm nay**.
 *
 * ## Vì sao ở trang Hôm nay chứ không ở khay cảnh báo vận hành
 *
 * Khay (`collect-ops-alerts.ts`) hiện trên MỌI trang nên nó cấm hẳn truy vấn database — mỗi truy
 * vấn thêm vào là một truy vấn nhân với số trang người ta mở. Cảnh báo dưới đây phải đọc kho, nên
 * nó thuộc về trang Hôm nay, đúng ranh giới file kia đã vạch.
 *
 * ## Một phép chấm, hai mức
 *
 * Cả hai mức đều đọc `describeAccountReadiness()` — không có phép chấm thứ hai ở đây. Chia mức
 * theo **nguyên nhân**, vì hai nguyên nhân dẫn tới hai hành động khác nhau:
 *
 * | Mức | Khi nào | Vì sao nặng hơn / nhẹ hơn |
 * |---|---|---|
 * | 🔴 | cụm lệch, hoặc máy đã thu hồi | Đáng lẽ **không xảy ra được** — `assignAccountCluster` chặn từ lúc ghi. Có hàng nghĩa là bất biến đã trôi, và nó trôi âm thầm vì cả hai đầu đều trông đúng |
 * | 🟡 | còn thiếu thứ gì đó (proxy, profile, chủ, máy) | Bình thường với nick vừa nhập; chỉ là chưa ai làm nốt |
 *
 * Nick chỉ còn chờ cold-start **không** vào đây: nó đã có mục riêng ở trang Hôm nay, và một nick
 * đang chờ đúng lịch thì không phải việc cần ai xử lý.
 *
 * Nick `DEAD` bị bỏ qua: nick đã nghỉ thì thiếu gì cũng là đúng, không phải sót.
 */
import { prisma } from "@/lib/db/prisma-client";
import { describeAccountReadiness, type AccountReadiness } from "./account-readiness";

export interface UnreadyAccountRow {
  id: string;
  username: string;
  readiness: AccountReadiness;
}

export interface ClusterWarnings {
  /** Bất biến cụm đã trôi — xem bảng trong chú thích đầu file. */
  broken: UnreadyAccountRow[];
  /** Chưa cấu hình xong. */
  incomplete: UnreadyAccountRow[];
}

/** Hai mã báo rằng cụm đã trôi chứ không phải chưa làm xong. */
const BROKEN_CODES = ["CLUSTER_DRIFT", "DEVICE_REVOKED"] as const;

export async function loadClusterWarnings(): Promise<ClusterWarnings> {
  const accounts = await prisma.account.findMany({
    where: { status: { not: "DEAD" } },
    select: {
      id: true,
      username: true,
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
    orderBy: { username: "asc" },
  });

  const broken: UnreadyAccountRow[] = [];
  const incomplete: UnreadyAccountRow[] = [];

  for (const account of accounts) {
    const readiness = describeAccountReadiness(account);

    // Sẵn sàng, hoặc chỉ còn chờ cold-start → không phải việc của dải này.
    if (readiness.ready || readiness.waiting) continue;

    const row = { id: account.id, username: account.username, readiness };
    const isBroken = readiness.blockers.some((blocker) =>
      BROKEN_CODES.includes(blocker.code as (typeof BROKEN_CODES)[number]),
    );

    if (isBroken) broken.push(row);
    else incomplete.push(row);
  }

  return { broken, incomplete };
}
