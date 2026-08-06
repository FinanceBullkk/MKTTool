/**
 * Hai kiểu hỏng của **cụm danh tính** mà không màn hình nào tự lộ ra.
 *
 * ## Vì sao ở trang Hôm nay chứ không ở khay cảnh báo vận hành
 *
 * Khay (`collect-ops-alerts.ts`) hiện trên MỌI trang nên nó cấm hẳn truy vấn database — mỗi
 * truy vấn thêm vào là một truy vấn nhân với số trang người ta mở. Hai cảnh báo dưới đây phải
 * đọc kho, nên chúng thuộc về trang Hôm nay, đúng ranh giới file kia đã vạch.
 *
 * ## Hai kiểu hỏng, hai mức
 *
 * | Kiểu | Mức | Triệu chứng nếu không kêu |
 * |---|---|---|
 * | **Lệch bất biến** — nick ghim vào máy của người không phải chủ, hoặc máy đã thu hồi | đỏ | Chủ nick xin được bí mật nhưng vé bay về máy người khác. Cả hai đầu đều "đúng" nên không ai đi tìm |
 * | **Chưa ghim máy** — có profile antidetect mà không biết nó ở máy nào | vàng | Bấm mở profile mới biết. Với nick đang cold-start thì phát hiện muộn hàng tuần |
 *
 * Kiểu thứ nhất đáng lẽ không xảy ra được: `assignAccountCluster()` chặn từ lúc ghi. Nó vẫn
 * được soi vì bất biến bắc qua hai bảng, mà Postgres không ép được kiểu đó nếu không có trigger —
 * và một bất biến chỉ do code giữ là một bất biến sẽ có ngày trôi. Sổ nói sai về việc một nick
 * sẵn sàng hay chưa thì tệ hơn sổ không nói gì.
 *
 * Nick `DEAD` bị bỏ qua ở cả hai: nick đã nghỉ thì không ghim máy nào là đúng, không phải thiếu sót.
 */
import { prisma } from "@/lib/db/prisma-client";

export interface DriftedClusterRow {
  id: string;
  username: string;
  /** Email chủ nick, `null` khi nick không có chủ mà vẫn còn ghim máy. */
  ownerEmail: string | null;
  deviceName: string;
  /** Chủ của chiếc máy đang ghim — chỗ lệch nằm ở đây. */
  deviceOwnerEmail: string;
  revoked: boolean;
}

export interface UnpinnedNickRow {
  id: string;
  username: string;
  platform: string;
}

export interface ClusterWarnings {
  drifted: DriftedClusterRow[];
  unpinned: UnpinnedNickRow[];
}

export async function loadClusterWarnings(): Promise<ClusterWarnings> {
  const [pinned, unpinned] = await Promise.all([
    // Lọc phần lệch bằng JS chứ không bằng `where`: so hai cột nằm ở hai bảng khác nhau
    // (`Account.ownerId` với `RelayDevice.userId`) là thứ Prisma không diễn đạt được. Số hàng ở
    // đây bằng số nick có ghim máy — hàng chục, không phải hàng vạn.
    prisma.account.findMany({
      where: { deviceId: { not: null }, status: { not: "DEAD" } },
      select: {
        id: true,
        username: true,
        ownerId: true,
        owner: { select: { email: true } },
        device: {
          select: { name: true, userId: true, revokedAt: true, user: { select: { email: true } } },
        },
      },
      orderBy: { username: "asc" },
    }),
    prisma.account.findMany({
      where: {
        deviceId: null,
        antidetectProfileId: { not: null },
        status: { not: "DEAD" },
      },
      select: { id: true, username: true, platform: true },
      orderBy: { username: "asc" },
    }),
  ]);

  const drifted = pinned
    .filter((row) => row.device !== null)
    .filter((row) => row.device!.userId !== row.ownerId || row.device!.revokedAt !== null)
    .map((row) => ({
      id: row.id,
      username: row.username,
      ownerEmail: row.owner?.email ?? null,
      deviceName: row.device!.name,
      deviceOwnerEmail: row.device!.user.email,
      revoked: row.device!.revokedAt !== null,
    }));

  return { drifted, unpinned };
}

/** Câu giải thích một hàng lệch — hai nguyên nhân, hai việc phải làm khác nhau. */
export function describeDrift(row: DriftedClusterRow): string {
  if (row.revoked) {
    return `ghim ở máy "${row.deviceName}" đã bị thu hồi`;
  }
  return (
    `ghim ở máy "${row.deviceName}" của ${row.deviceOwnerEmail}, nhưng chủ nick là ` +
    `${row.ownerEmail ?? "— chưa ai"}`
  );
}
