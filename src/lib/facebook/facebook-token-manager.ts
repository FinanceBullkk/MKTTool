/**
 * Lưu và kiểm tra token Facebook.
 *
 * Mọi token đi qua đây đều được mã hóa TRƯỚC khi chạm database, giống credential nick —
 * Page token cho phép đăng bài dưới tên thương hiệu, mất nó nặng ngang mất mật khẩu.
 */
import { encryptCredential, decryptCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { FacebookGraphError, graphGet } from "./facebook-graph-client";
import type { FacebookIdentity, LongLivedToken, ManagedPage } from "./facebook-oauth-flow";

export interface SaveConnectionResult {
  connectionId: string;
  savedPages: number;
  /** Page bị bỏ qua vì trùng tên với đích đã có của Page khác. */
  skippedPages: string[];
}

/**
 * Mỗi Fanpage cần một `PlatformTarget` thì hàng đợi mới xếp lịch vào nó được.
 * Tạo sẵn ở đây để bạn MKT không phải nhập tay cùng một cái tên ở hai chỗ.
 *
 * Trả về null nếu đích trùng tên đã thuộc về Page khác — thà bỏ trống rồi báo,
 * còn hơn nối nhầm để bài của Page này bay sang Page kia.
 */
async function ensureTargetForPage(page: ManagedPage): Promise<string | null> {
  const existing = await prisma.platformTarget.findUnique({
    where: { platform_name: { platform: "FACEBOOK_PAGE", name: page.name } },
    include: { facebookPage: { select: { pageId: true } } },
  });

  if (existing) {
    const owner = existing.facebookPage?.pageId;
    return !owner || owner === page.id ? existing.id : null;
  }

  const created = await prisma.platformTarget.create({
    data: {
      platform: "FACEBOOK_PAGE",
      name: page.name,
      url: `https://www.facebook.com/${page.id}`,
      // Fanpage là kênh của chính mình: không có mod duyệt, không có luật karma.
      // Bốn luật giữ nhịp cũng không áp (xem COMMUNITY_PLATFORMS).
      notes: "Tự tạo khi kết nối Fanpage qua Graph API.",
    },
  });
  return created.id;
}

/** Lưu kết quả OAuth: một connection + n Page, ghi đè token cũ nếu kết nối lại. */
export async function saveConnectionWithPages(
  identity: FacebookIdentity,
  token: LongLivedToken,
  pages: ManagedPage[],
): Promise<SaveConnectionResult> {
  const tokenEnc = encryptCredential(token.accessToken);

  const connection = await prisma.facebookConnection.upsert({
    where: { fbUserId: identity.id },
    create: {
      fbUserId: identity.id,
      name: identity.name,
      accessTokenEnc: tokenEnc,
      expiresAt: token.expiresAt,
    },
    update: { name: identity.name, accessTokenEnc: tokenEnc, expiresAt: token.expiresAt },
  });

  const skippedPages: string[] = [];
  let savedPages = 0;

  for (const page of pages) {
    const targetId = await ensureTargetForPage(page);
    if (targetId === null) skippedPages.push(page.name);

    await prisma.facebookPage.upsert({
      where: { pageId: page.id },
      create: {
        pageId: page.id,
        name: page.name,
        accessTokenEnc: encryptCredential(page.accessToken),
        connectionId: connection.id,
        targetId,
        tokenValid: true,
        tokenCheckedAt: new Date(),
      },
      update: {
        name: page.name,
        accessTokenEnc: encryptCredential(page.accessToken),
        connectionId: connection.id,
        // Kết nối lại là để chữa token hỏng — dọn luôn cờ hỏng cũ.
        tokenValid: true,
        tokenNote: null,
        tokenCheckedAt: new Date(),
        ...(targetId ? { targetId } : {}),
      },
    });
    savedPages += 1;
  }

  return { connectionId: connection.id, savedPages, skippedPages };
}

export function decryptPageToken(accessTokenEnc: string): string {
  return decryptCredential(accessTokenEnc);
}

/** Ghi lại việc Facebook từ chối token, để UI hiện đúng nguyên nhân thay vì im lặng. */
export async function markPageTokenInvalid(pageId: string, note: string): Promise<void> {
  await prisma.facebookPage.update({
    where: { pageId },
    data: { tokenValid: false, tokenNote: note.slice(0, 300), tokenCheckedAt: new Date() },
  });
}

export interface TokenCheckResult {
  pageId: string;
  name: string;
  ok: boolean;
  message: string;
}

/**
 * Gọi thử Graph API bằng từng Page token.
 *
 * Cần thiết vì token chết KHÔNG báo trước: nick admin đổi mật khẩu, gỡ app, hoặc bị Meta
 * khóa là token thành rác ngay, mà chỉ lộ ra ở lần đăng tiếp theo — thường là lúc đang vội.
 */
export async function verifyAllPageTokens(): Promise<TokenCheckResult[]> {
  const pages = await prisma.facebookPage.findMany({ orderBy: { name: "asc" } });
  const results: TokenCheckResult[] = [];

  for (const page of pages) {
    try {
      const token = decryptPageToken(page.accessTokenEnc);
      await graphGet<{ id: string }>(page.pageId, { fields: "id,name" }, token);

      await prisma.facebookPage.update({
        where: { id: page.id },
        data: { tokenValid: true, tokenNote: null, tokenCheckedAt: new Date() },
      });
      results.push({ pageId: page.pageId, name: page.name, ok: true, message: "Token còn dùng được." });
    } catch (error) {
      const message =
        error instanceof FacebookGraphError
          ? error.message
          : "Không kiểm tra được token (lỗi cục bộ, không phải Facebook từ chối).";

      // Chỉ đánh dấu hỏng khi CHÍNH Facebook từ chối token. Mất mạng mà bôi đỏ hết
      // thì lần sau không ai tin cái đèn nữa.
      if (error instanceof FacebookGraphError && error.tokenExpired) {
        await markPageTokenInvalid(page.pageId, message);
      }
      results.push({ pageId: page.pageId, name: page.name, ok: false, message });
    }
  }

  return results;
}
