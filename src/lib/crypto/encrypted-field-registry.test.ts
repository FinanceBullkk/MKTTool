import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENCRYPTED_MODELS,
  type VaultDomain,
  countEncryptedFields,
} from "./encrypted-field-registry";

/**
 * Đọc thẳng schema thay vì tin danh sách khai tay.
 *
 * Quy ước của dự án: mọi cột kết thúc bằng `Enc` đều chứa ciphertext, và mỗi cột như vậy mang
 * dấu `vault:server` hoặc `vault:operator` trong comment cùng dòng (ghi ở đầu schema.prisma).
 * Nhờ quy ước đó mà bài test này bắt được cột mới chưa khai trong registry, và bắt được cột
 * khai lệch vùng khóa — hai thứ mà mắt người review sẽ bỏ sót sau vài tháng.
 */
type SchemaField = { name: string; domain: VaultDomain | null };

function readEncryptedFieldsFromSchema(): Map<string, SchemaField[]> {
  const schema = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const found = new Map<string, SchemaField[]>();

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
      const marked = line.match(/\bvault:(server|operator)\b/);
      found.set(currentModel, [
        ...(found.get(currentModel) ?? []),
        { name: field[1], domain: marked ? (marked[1] as VaultDomain) : null },
      ]);
    }
  }

  return found;
}

function sortByName<T extends { name: string }>(fields: readonly T[]): T[] {
  return [...fields].sort((a, b) => a.name.localeCompare(b.name));
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
      const declared = sortByName(entry.fields).map((field) => field.name);
      const inSchema = sortByName(fromSchema.get(entry.model) ?? []).map((field) => field.name);
      expect(declared, `model ${entry.model}`).toEqual(inSchema);
    }
  });

  it("mọi cột trong schema đều mang dấu vùng khóa — chia vùng là quyết định phải nghĩ", () => {
    const unmarked = [...fromSchema.entries()].flatMap(([model, fields]) =>
      fields.filter((field) => !field.domain).map((field) => `${model}.${field.name}`),
    );
    expect(unmarked, "thiếu `// vault:server` hoặc `// vault:operator` trong schema.prisma").toEqual(
      [],
    );
  });

  it("vùng khóa khai trong registry khớp với dấu trong schema", () => {
    for (const entry of ENCRYPTED_MODELS) {
      const inSchema = new Map(
        (fromSchema.get(entry.model) ?? []).map((field) => [field.name, field.domain]),
      );
      for (const field of entry.fields) {
        expect(field.domain, `${entry.model}.${field.name}`).toBe(inSchema.get(field.name));
      }
    }
  });

  it("credential của nick nằm trọn trong vùng operator — máy chủ không mở được cái nào", () => {
    const account = ENCRYPTED_MODELS.find((entry) => entry.model === "Account");
    expect(account?.fields.every((field) => field.domain === "operator")).toBe(true);
  });

  it("đếm tổng số cột khớp với schema, và tách theo vùng thì cộng lại đủ", () => {
    const total = [...fromSchema.values()].reduce((sum, fields) => sum + fields.length, 0);
    expect(countEncryptedFields()).toBe(total);
    expect(countEncryptedFields("server") + countEncryptedFields("operator")).toBe(total);
  });
});
