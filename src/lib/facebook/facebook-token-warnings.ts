/**
 * Token Facebook nào đang hỏng hoặc sắp hết hạn — để trang Hôm nay nói ra thay vì đợi
 * người dùng nhớ vào `/facebook` bấm kiểm.
 *
 * Token chết KHÔNG BÁO TRƯỚC: nick admin đổi mật khẩu, gỡ app, hoặc bị Meta khóa là token
 * thành rác ngay. Cách phát hiện trước đợt này là "bấm nút theo thói quen" — thói quen không
 * phải là cơ chế, và chỗ nó hỏng luôn là lúc cần đăng gấp.
 *
 * Chỉ ĐỌC DATABASE, không gọi Graph API: trang Hôm nay là trang mở nhiều nhất, gắn một lời
 * gọi mạng vào đó là làm chậm mọi lần mở. Đổi lại, thứ đọc được là kết quả của lần kiểm gần
 * nhất — nên câu chữ phải nói kèm thời điểm kiểm, đừng khẳng định như tình trạng hiện tại.
 */
import { prisma } from "@/lib/db/prisma-client";
import { type TokenHealthLevel, evaluateTokenHealth } from "./facebook-token-health";

export interface FacebookTokenWarning {
  pageId: string;
  pageName: string;
  level: TokenHealthLevel;
  message: string;
  /** Lần gọi Graph gần nhất — null nghĩa là chưa kiểm lần nào kể từ khi kết nối. */
  checkedAt: Date | null;
}

export interface FacebookTokenWarnings {
  /** Không đăng được nữa: bị từ chối hoặc đã hết hạn. */
  broken: FacebookTokenWarning[];
  /** Còn đăng được nhưng sắp chết — xem TOKEN_WARN_DAYS. */
  expiringSoon: FacebookTokenWarning[];
}

export async function loadFacebookTokenWarnings(
  now: Date = new Date(),
): Promise<FacebookTokenWarnings> {
  const pages = await prisma.facebookPage.findMany({
    orderBy: { name: "asc" },
    include: { connection: { select: { expiresAt: true } } },
  });

  const broken: FacebookTokenWarning[] = [];
  const expiringSoon: FacebookTokenWarning[] = [];

  for (const page of pages) {
    // Dùng lại đúng hàm mà luồng đăng bài đang dùng. Hai nơi tự đánh giá "token còn dùng
    // được không" là hai nơi chắc chắn sẽ lệch nhau, và lệch theo hướng nguy hiểm:
    // cảnh báo im lặng trong khi lúc đăng lại chặn.
    const health = evaluateTokenHealth(
      {
        expiresAt: page.connection.expiresAt,
        tokenValid: page.tokenValid,
        tokenNote: page.tokenNote,
      },
      now,
    );

    if (health.level === "OK") continue;

    const warning: FacebookTokenWarning = {
      pageId: page.id,
      pageName: page.name,
      level: health.level,
      message: health.message,
      checkedAt: page.tokenCheckedAt,
    };

    if (health.usable) expiringSoon.push(warning);
    else broken.push(warning);
  }

  return { broken, expiringSoon };
}
