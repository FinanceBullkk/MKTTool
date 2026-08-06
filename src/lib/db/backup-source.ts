/**
 * Sao lưu đang hút từ database NÀO — máy mình hay máy chủ thật.
 *
 * ## Vì sao phải là một khái niệm riêng, không chỉ là "đổi `DATABASE_URL` đi rồi chạy lại"
 *
 * Từ GĐ5 kho thật nằm trên Railway, còn `npm run db:backup` chạy ở laptop. Cách ngắn nhất là bảo
 * người dùng tạm đổi `DATABASE_URL` sang URL của máy chủ — và cách đó hỏng theo hai chiều, cả hai
 * đều im lặng:
 *
 * 1. **Quên đổi lại.** `DATABASE_URL` là biến mọi lệnh khác đọc: `db:upgrade` áp migration,
 *    `vault:rekey` mã hóa lại credential, `npm run dev` phục vụ trang. Một biến còn trỏ vào máy
 *    chủ sau khi sao lưu xong là một lệnh phát triển chạy thẳng lên kho thật.
 * 2. **Hai bản sao trông giống hệt nhau.** `mkttool-06-08-2026-09-15.sql` không nói nó đến từ
 *    đâu. Khôi phục nhầm bản của máy dev vào máy chủ là thay kho thật bằng dữ liệu thử, và tên
 *    file không có gì để ngăn.
 *
 * Nên nguồn là một tham số tường minh, và **tên file mang theo nguồn** (`mkttool-prod-…`).
 */

/** Biến môi trường trỏ tới Postgres của máy chủ thật. CHỈ khai ở máy người quản trị. */
export const REMOTE_DATABASE_URL_ENV = "PRODUCTION_DATABASE_URL";

export type BackupSourceKind = "local" | "remote";

export interface BackupSource {
  kind: BackupSourceKind;
  databaseUrl: string;
  /** Tiền tố tên file — thứ giữ cho hai bản sao không lẫn vào nhau trong cùng một thư mục. */
  namePrefix: string;
}

export class BackupSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupSourceError";
  }
}

/**
 * Chọn nguồn theo cờ dòng lệnh.
 *
 * Thiếu biến thì **ném lỗi**, không bao giờ lùi về database máy mình: `--remote` mà lặng lẽ dump
 * máy dev là dựng ra một file mang tên `mkttool-prod-…` chứa dữ liệu thử — bản sao lưu nói dối,
 * và chỉ lộ ra vào đúng ngày cần tới nó.
 */
export function resolveBackupSource(
  kind: BackupSourceKind,
  env: Partial<Record<string, string>> = process.env,
): BackupSource {
  if (kind === "local") {
    const databaseUrl = env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      throw new BackupSourceError(
        "Thiếu DATABASE_URL. Sao chép .env.example thành .env rồi điền giá trị.",
      );
    }
    return { kind, databaseUrl, namePrefix: "mkttool" };
  }

  const databaseUrl = env[REMOTE_DATABASE_URL_ENV]?.trim();
  if (!databaseUrl) {
    throw new BackupSourceError(
      `Thiếu ${REMOTE_DATABASE_URL_ENV}, nên không biết hút bản sao từ đâu.\n` +
        `Lấy chuỗi nối của Postgres trên Railway (biến DATABASE_PUBLIC_URL của dịch vụ Postgres), ` +
        `thêm "?sslmode=require", rồi khai vào .env của MÁY BẠN:\n` +
        `  ${REMOTE_DATABASE_URL_ENV}="postgresql://…?sslmode=require"\n` +
        `Đừng khai biến này trên chính máy chủ — ở đó database đã là DATABASE_URL rồi.`,
    );
  }

  return { kind, databaseUrl, namePrefix: "mkttool-prod" };
}

/**
 * Câu mô tả nơi đang hút, **không có mật khẩu**.
 *
 * In ra trước khi chạy chứ không phải sau: người bấm nhầm nguồn cần thấy điều đó trước khi có một
 * file mang tên sai nằm trong thư mục sao lưu.
 */
export function describeDatabaseTarget(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    const database = decodeURIComponent(url.pathname.replace(/^\//, "")) || "(không rõ tên)";
    return `${url.hostname}:${url.port || "5432"}/${database}`;
  } catch {
    // Không parse được thì `postgresToolEnv` sẽ ném lỗi kèm hướng dẫn ngay sau đó. Ở đây chỉ cần
    // đừng làm hỏng dòng thông báo, và tuyệt đối đừng in nguyên URL — nó có mật khẩu.
    return "(URL không đọc được)";
  }
}
