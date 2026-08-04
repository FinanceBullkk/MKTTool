/**
 * Danh sách mọi cột đang chứa ciphertext, theo từng bảng, kèm vùng khóa của từng cột.
 *
 * Tồn tại vì hai việc:
 *
 *  1. Xoay khóa phải quét đúng và đủ mọi cột. Bỏ sót một cột là sau khi xoay khóa, cột đó
 *     thành rác không giải mã lại được — và chỉ lộ ra vào lúc cần dùng credential đó, tức là
 *     lúc tệ nhất.
 *  2. Từ GĐ3, kho chia làm hai vùng khóa. `server` là những cột máy chủ tự mở được; `operator`
 *     là những cột chỉ cầu nối trên máy người vận hành mở được — máy chủ KHÔNG giữ khóa đó.
 *     Chia nhầm vùng cho một cột là hỏng đúng thứ mà việc chia vùng sinh ra để bảo vệ, nên
 *     vùng phải khai ra thành dữ liệu chứ không nằm rải trong logic.
 *
 * Danh sách này KHÔNG tự sinh từ Prisma, nên nó có thể lệch với schema. Bài test đi kèm
 * (encrypted-field-registry.test.ts) đọc thẳng prisma/schema.prisma và bắt lỗi lệch theo cả
 * hai chiều — thêm cột `...Enc` mà quên khai ở đây, hoặc khai lệch vùng so với dấu
 * `vault:server` / `vault:operator` ghi trong schema, là test đỏ ngay.
 */

/** Khóa nào mở được một cột. Xem plans/260804-1752-web-chung-cho-team-phan-tan/phase-03. */
export type VaultDomain = "server" | "operator";

export interface EncryptedField {
  /** Tên cột trong Prisma schema. */
  name: string;
  /** Vùng khóa quản lý cột này. */
  domain: VaultDomain;
}

export interface EncryptedModel {
  /** Tên model trong Prisma schema. */
  model: string;
  /** Các cột chứa chuỗi đã mã hóa. */
  fields: readonly EncryptedField[];
}

export const ENCRYPTED_MODELS: readonly EncryptedModel[] = [
  { model: "Proxy", fields: [{ name: "passwordEnc", domain: "server" }] },
  { model: "ObserverProxy", fields: [{ name: "passwordEnc", domain: "server" }] },
  {
    model: "Account",
    fields: [
      { name: "passwordEnc", domain: "operator" },
      { name: "emailPasswordEnc", domain: "operator" },
      { name: "totpSecretEnc", domain: "operator" },
    ],
  },
  { model: "FacebookConnection", fields: [{ name: "accessTokenEnc", domain: "server" }] },
  { model: "FacebookPage", fields: [{ name: "accessTokenEnc", domain: "server" }] },
] as const;

/**
 * Tổng số cột phải xử lý — dùng để đối chiếu nhanh trong báo cáo của script xoay khóa.
 *
 * Xoay khóa từ GĐ3 chạy theo từng vùng, nên truyền `domain` để đếm đúng phần việc của lượt đó.
 * Không truyền thì đếm tất.
 */
export function countEncryptedFields(domain?: VaultDomain): number {
  return ENCRYPTED_MODELS.reduce(
    (total, entry) =>
      total + entry.fields.filter((field) => !domain || field.domain === domain).length,
    0,
  );
}
