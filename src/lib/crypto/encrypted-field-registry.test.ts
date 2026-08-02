import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENCRYPTED_MODELS, countEncryptedFields } from "./encrypted-field-registry";

/**
 * Đọc thẳng schema thay vì tin danh sách khai tay.
 *
 * Quy ước của dự án: mọi cột kết thúc bằng `Enc` đều chứa ciphertext (ghi ở đầu schema.prisma).
 * Nhờ quy ước đó mà bài test này bắt được cột mới chưa khai trong registry — thứ mà mắt người
 * review sẽ bỏ sót sau vài tháng.
 */
function readEncryptedFieldsFromSchema(): Map<string, string[]> {
  const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const found = new Map<string, string[]>();

  let currentModel: string | null = null;
  for (const line of schema.split(/\r?\n/)) {
    const modelStart = line.match(/^model\s+(\w+)\s*\{/);
    if (modelStart) {
      currentModel = modelStart[1];
      continue;
    }
    if (line.startsWith("}")) {
      currentModel = null;
      continue;
    }
    if (!currentModel) continue;

    const field = line.trim().match(/^(\w+Enc)\s+String/);
    if (field) {
      found.set(currentModel, [...(found.get(currentModel) ?? []), field[1]]);
    }
  }

  return found;
}

describe("registry cột mã hóa", () => {
  const fromSchema = readEncryptedFieldsFromSchema();

  it("schema thật sự có cột mã hóa (bài test không tự vô hiệu hóa)", () => {
    expect(fromSchema.size).toBeGreaterThan(0);
  });

  it("khai đúng danh sách model có cột mã hóa", () => {
    const declared = ENCRYPTED_MODELS.map((entry) => entry.model).sort();
    expect(declared).toEqual([...fromSchema.keys()].sort());
  });

  it("khai đủ mọi cột của từng model — thiếu một cột là xoay khóa làm hỏng cột đó", () => {
    for (const entry of ENCRYPTED_MODELS) {
      expect([...entry.fields].sort(), `model ${entry.model}`).toEqual(
        (fromSchema.get(entry.model) ?? []).sort(),
      );
    }
  });

  it("đếm tổng số cột khớp với schema", () => {
    const total = [...fromSchema.values()].reduce((sum, fields) => sum + fields.length, 0);
    expect(countEncryptedFields()).toBe(total);
  });
});
