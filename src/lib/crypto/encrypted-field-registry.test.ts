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

describe("encrypted field registry", () => {
  const fromSchema = readEncryptedFieldsFromSchema();

  it("finds encrypted columns in the schema so the test cannot disable itself", () => {
    expect(fromSchema.size).toBeGreaterThan(0);
  });

  it("declares the exact models that contain encrypted columns", () => {
    const declared = ENCRYPTED_MODELS.map((entry) => entry.model).sort();
    expect(declared).toEqual([...fromSchema.keys()].sort());
  });

  it("declares every encrypted column because a missing column breaks key rotation", () => {
    for (const entry of ENCRYPTED_MODELS) {
      const declared = sortByName(entry.fields).map((field) => field.name);
      const inSchema = sortByName(fromSchema.get(entry.model) ?? []).map((field) => field.name);
      expect(declared, `model ${entry.model}`).toEqual(inSchema);
    }
  });

  it("requires every schema column to declare its key domain", () => {
    const unmarked = [...fromSchema.entries()].flatMap(([model, fields]) =>
      fields.filter((field) => !field.domain).map((field) => `${model}.${field.name}`),
    );
    expect(unmarked, "missing `// vault:server` or `// vault:operator` in schema.prisma").toEqual(
      [],
    );
  });

  it("matches registry key domains to schema markers", () => {
    for (const entry of ENCRYPTED_MODELS) {
      const inSchema = new Map(
        (fromSchema.get(entry.model) ?? []).map((field) => [field.name, field.domain]),
      );
      for (const field of entry.fields) {
        expect(field.domain, `${entry.model}.${field.name}`).toBe(inSchema.get(field.name));
      }
    }
  });

  it("keeps every nick credential in the operator domain so the server cannot open them", () => {
    const account = ENCRYPTED_MODELS.find((entry) => entry.model === "Account");
    expect(account?.fields.every((field) => field.domain === "operator")).toBe(true);
  });

  it("matches the schema field count and partitions the total by domain", () => {
    const total = [...fromSchema.values()].reduce((sum, fields) => sum + fields.length, 0);
    expect(countEncryptedFields()).toBe(total);
    expect(countEncryptedFields("server") + countEncryptedFields("operator")).toBe(total);
  });
});
