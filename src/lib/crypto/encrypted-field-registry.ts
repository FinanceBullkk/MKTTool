/**
 * Danh sách mọi cột đang chứa ciphertext, theo từng bảng.
 *
 * Tồn tại vì một việc duy nhất: đổi VAULT_KEY phải quét đúng và đủ mọi cột. Bỏ sót một cột
 * là sau khi xoay khóa, cột đó thành rác không giải mã lại được — và chỉ lộ ra vào lúc cần
 * dùng credential đó, tức là lúc tệ nhất.
 *
 * Danh sách này KHÔNG tự sinh từ Prisma, nên nó có thể lệch với schema. Bài test đi kèm
 * (encrypted-field-registry.test.ts) đọc thẳng prisma/schema.prisma và bắt lỗi lệch theo cả
 * hai chiều — thêm cột `...Enc` mà quên khai ở đây là test đỏ ngay.
 */

export interface EncryptedModel {
  /** Tên model trong Prisma schema. */
  model: string;
  /** Các cột chứa chuỗi đã mã hóa. */
  fields: readonly string[];
}

export const ENCRYPTED_MODELS: readonly EncryptedModel[] = [
  { model: "Proxy", fields: ["passwordEnc"] },
  { model: "ObserverProxy", fields: ["passwordEnc"] },
  { model: "Account", fields: ["passwordEnc", "emailPasswordEnc", "totpSecretEnc"] },
  { model: "FacebookConnection", fields: ["accessTokenEnc"] },
  { model: "FacebookPage", fields: ["accessTokenEnc"] },
] as const;

/** Tổng số cột phải xử lý — dùng để đối chiếu nhanh trong báo cáo của script xoay khóa. */
export function countEncryptedFields(): number {
  return ENCRYPTED_MODELS.reduce((total, entry) => total + entry.fields.length, 0);
}
