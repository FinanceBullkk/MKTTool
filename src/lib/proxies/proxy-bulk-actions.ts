"use server";

/**
 * Nhập proxy theo lô — dán một danh sách, mỗi dòng một IP.
 *
 * ## Vì sao đi qua `proxyCreateSchema` chứ không gọi thẳng Prisma
 *
 * Bản đầu (19/08/2026) gọi `prisma.proxy.create()` trực tiếp và **bịa ba giá trị** cho mọi dòng:
 *
 * | Bịa | Hậu quả |
 * |---|---|
 * | `type: "MOBILE_4G"` | Cột `type` là `String`, nên giá trị này **ghi được** — trong khi cả kho chỉ hiểu `STATIC_ISP` và `MOBILE`. Hỏng im lặng, chỉ lộ ra lúc đọc |
 * | `country: "VN"` | `Proxy.country` quyết định ngôn ngữ và múi giờ của **cấu hình profile** (xem `profile-fingerprint-plan.ts`). IP Mỹ với locale Việt là cấu hình cần kiểm tra, không phải identity proof |
 * | `protocol: "http"` | Proxy socks5 bị ghi sai giao thức, và cấu hình sai đó đi thẳng vào profile antidetect |
 *
 * Đi qua schema thì ba cột đó **phải được khai**, và một giá trị lạ bị chặn ngay thay vì nằm
 * trong database chờ ngày ai đó đọc phải.
 *
 * Quốc gia không đoán được từ `host:port` — nên nó là **tham số của cả lô**, do người dán khai,
 * không phải mặc định do code chọn hộ.
 *
 * ## Vì sao báo cáo từng dòng hỏng
 *
 * Bản đầu bọc mỗi lượt ghi trong `catch {}` rỗng rồi báo `"Đã import thành công N/M"` — câu đó
 * đọc như mọi thứ đều xong, trong khi `N` có thể là 0. Dán 20 proxy, 19 dòng sai định dạng, vẫn
 * thấy chữ "thành công". Ở đây mỗi dòng hỏng được kể ra kèm số thứ tự dòng.
 */

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { adminAction } from "@/lib/auth/guarded-action";
import { proxyCreateSchema } from "@/lib/accounts/vault-form-schemas";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";
import { prisma } from "@/lib/db/prisma-client";
import { isUniqueConstraintError } from "@/lib/db/prisma-error-helpers";

/** Ba cột không suy ra được từ `host:port` — người dán khai một lần cho cả lô. */
export interface BulkProxyDefaults {
  country: string;
  type: string;
  protocol: string;
}

/** Số dòng hỏng kể ra tối đa; nhiều hơn thì gộp lại, tránh một câu dài ba màn hình. */
const MAX_ERRORS_SHOWN = 5;

/**
 * Tách một dòng thành các phần. Trả `null` nếu dòng không đủ `host:port`.
 *
 * Hai định dạng: `host:port:user:pass` và `label|host:port:user:pass`. Thiếu nhãn thì đặt theo
 * host và cổng, vì `Proxy.label` là `@unique` và bỏ trống sẽ đụng nhau ngay dòng thứ hai.
 */
function parseLine(line: string): Record<string, string> | null {
  let label = "";
  let body = line;

  const pipe = line.indexOf("|");
  if (pipe !== -1) {
    label = line.slice(0, pipe).trim();
    body = line.slice(pipe + 1).trim();
  }

  const segments = body.split(":").map((segment) => segment.trim());
  if (segments.length < 2) return null;

  const [host, port, username = "", password = ""] = segments;
  if (!host || !port) return null;

  return {
    label: label || `proxy-${host.replace(/\./g, "-")}-${port}`,
    host,
    port,
    username,
    password,
  };
}

export const createBulkProxies = adminAction(async function createBulkProxies(
  _actor,
  bulkText: string,
  defaults: BulkProxyDefaults,
): Promise<ActionResult> {
  const lines = bulkText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (lines.length === 0) {
    return { ok: false, message: "Danh sách proxy rỗng." };
  }

  const vaultKey = loadVaultKey("server");
  const errors: string[] = [];
  let created = 0;

  for (const [index, line] of lines.entries()) {
    const lineNo = index + 1;
    const fields = parseLine(line);

    if (!fields) {
      errors.push(`dòng ${lineNo}: không đọc được, cần ít nhất host:port`);
      continue;
    }

    const parsed = proxyCreateSchema.safeParse({ ...fields, ...defaults });
    if (!parsed.success) {
      errors.push(`dòng ${lineNo}: ${parsed.error.issues[0]?.message ?? "dữ liệu không hợp lệ"}`);
      continue;
    }

    const { password, ...rest } = parsed.data;
    try {
      await prisma.proxy.create({
        data: { ...rest, passwordEnc: encryptCredential(password, vaultKey) },
      });
      created++;
    } catch (error) {
      errors.push(
        isUniqueConstraintError(error)
          ? `dòng ${lineNo}: trùng nhãn hoặc trùng host/port/username đã có`
          : `dòng ${lineNo}: lỗi ghi database`,
      );
    }
  }

  revalidatePath("/proxies");

  if (created > 0) revalidatePath("/");

  if (errors.length === 0) {
    return { ok: true, message: `Đã thêm ${created} proxy.` };
  }

  const shown = errors.slice(0, MAX_ERRORS_SHOWN).join("; ");
  const rest = errors.length > MAX_ERRORS_SHOWN ? ` (và ${errors.length - MAX_ERRORS_SHOWN} dòng nữa)` : "";
  const summary = `Thêm được ${created}/${lines.length} proxy. Bỏ qua: ${shown}${rest}.`;

  // `ok: false` kể cả khi có dòng vào được: màn hình phải dừng lại cho người ta đọc danh sách
  // dòng hỏng, thay vì đóng lại và để họ tự phát hiện thiếu proxy vào tuần sau.
  return { ok: created === lines.length, message: summary };
});
