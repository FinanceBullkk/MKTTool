import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { amzDate, encodeObjectKey, signRequest } from "./s3-signature-v4";

/**
 * **Đọc trước khi tin bộ test này.**
 *
 * Nó KHÔNG chứng minh chữ ký đúng — không có vector chuẩn nào để so (xem chú thích đầu
 * `s3-signature-v4.ts`). Nó kiểm **hình dạng** chuỗi ký, tức chỗ các lỗi thật hay nằm: thứ tự
 * header, viết thường, cắt khoảng trắng, dạng `credential scope`, dạng mốc thời gian, mã hóa tên
 * object. Phép kiểm quyết định là lượt tải lên đầu tiên, và ký sai thì R2 trả 403.
 *
 * Vài bài dưới đây ghim đúng chuỗi hex mà cài đặt HIỆN TẠI sinh ra. Đó là **khóa chống thoái
 * hóa**, không phải bằng chứng đúng: nó bắt được người sau vô tình đổi cách ghép chuỗi, và chỉ
 * vậy thôi. Bài nào thuộc loại đó đều nói rõ.
 */

/** Khóa mẫu của chính tài liệu AWS — chuỗi công bố công khai, không phải khóa thật của ai. */
const CREDENTIALS = {
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "auto",
  service: "s3",
};

const NOW = new Date("2026-08-06T03:15:00.123Z");

function sign(overrides: Partial<Parameters<typeof signRequest>[0]> = {}) {
  return signRequest(
    {
      method: "PUT",
      path: "/vault/mkttool-prod-20260806.sql",
      host: "abc123.r2.cloudflarestorage.com",
      payload: Buffer.from("backup contents"),
      now: NOW,
      ...overrides,
    },
    CREDENTIALS,
  );
}

/** Bóc `SignedHeaders=` và `Credential=` ra khỏi header Authorization. */
function part(headers: Record<string, string>, name: string): string {
  const found = new RegExp(`${name}=([^,]+)`).exec(headers.Authorization);
  return found ? found[1] : "";
}

describe("amzDate", () => {
  it("always uses UTC without separators or milliseconds", () => {
    expect(amzDate(NOW)).toBe("20260806T031500Z");
  });

  /**
   * Ngày trong `credential scope` là ngày **UTC**, cố ý KHÔNG đi qua `TEAM_TIMEZONE`. Đây là giao
   * thức của AWS, không phải "hôm nay" của nghiệp vụ — trộn hai thứ đó là chữ ký hỏng vào đúng
   * lúc nửa đêm giờ team, kiểu hỏng chỉ xảy ra mỗi ngày một lần trong bảy tiếng.
   */
  it("uses the UTC date rather than the team-time date", () => {
    // 20:00Z ngày 05/08 = 03:00 sáng 06/08 giờ Việt Nam.
    expect(amzDate(new Date("2026-08-05T20:00:00Z"))).toBe("20260805T200000Z");
  });
});

describe("signRequest", () => {
  it("sorts and lowercases signed headers", () => {
    const headers = sign({
      headers: {
        "Content-Type": "application/sql",
        "X-Amz-Content-Sha256": "abc",
      },
    });

    expect(part(headers, "SignedHeaders")).toBe(
      "content-type;host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("formats credential scope as date/region/service/aws4_request", () => {
    expect(part(sign(), "Credential")).toBe("AKIAIOSFODNN7EXAMPLE/20260806/auto/s3/aws4_request");
  });

  it("adds host and x-amz-date without adding unrelated headers", () => {
    const headers = sign();

    expect(headers.host).toBe("abc123.r2.cloudflarestorage.com");
    expect(headers["x-amz-date"]).toBe("20260806T031500Z");
    // `x-amz-content-sha256` là header riêng của S3 và do người gọi truyền vào. Tự thêm ở đây thì
    // hàm không còn khớp được với vector chuẩn của AWS nếu sau này lấy được bộ đó.
    expect(headers["x-amz-content-sha256"]).toBeUndefined();
    expect(part(headers, "SignedHeaders")).toBe("host;x-amz-date");
  });

  it("formats Authorization as AWS requires without a comma after the algorithm", () => {
    expect(sign().Authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=\S+, SignedHeaders=\S+, Signature=[0-9a-f]{64}$/,
    );
  });

  /** Giá trị header bị cắt đầu đuôi và gộp khoảng trắng liên tiếp — quy tắc của AWS. */
  it("ignores extra whitespace in header values when signing", () => {
    const gọn = sign({ headers: { "Content-Type": "application/sql" } });
    const thừa = sign({ headers: { "Content-Type": "  application/sql  " } });

    expect(thừa.Authorization).toBe(gọn.Authorization);
  });

  it("produces the same signature regardless of header-name case", () => {
    const thường = sign({ headers: { "content-type": "application/sql" } });
    const hoa = sign({ headers: { "CONTENT-TYPE": "application/sql" } });

    expect(hoa.Authorization).toBe(thường.Authorization);
  });

  it("changes the signature when one payload byte changes", () => {
    const a = sign({ payload: Buffer.from("backup contents") });
    const b = sign({ payload: Buffer.from("backup contentz") });

    expect(a.Authorization).not.toBe(b.Authorization);
  });

  it("changes the signature when the path changes", () => {
    expect(sign({ path: "/vault/a.sql" }).Authorization).not.toBe(
      sign({ path: "/vault/b.sql" }).Authorization,
    );
  });

  /**
   * Mốc neo DUY NHẤT lấy từ tài liệu AWS: chuỗi băm của nội dung rỗng. Tài liệu in thẳng giá trị
   * này trong ví dụ `CanonicalHeaders`, nên nó là thứ đối chiếu được với bên ngoài.
   */
  it("matches the empty-body hash published in AWS documentation", () => {
    expect(createHash("sha256").update(Buffer.alloc(0)).digest("hex")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  /**
   * **Khóa chống thoái hóa, KHÔNG phải bằng chứng đúng.** Con số này do chính cài đặt hiện tại
   * sinh ra. Nó bắt được người sau vô tình đổi cách ghép chuỗi ký; nó không nói gì về việc R2 có
   * chấp nhận chữ ký hay không. Sửa cách ghép có chủ ý thì cập nhật con số này — nhưng phải kèm
   * một lượt tải lên thật để biết bên kia còn nhận.
   */
  it("produces the same signature for the same input", () => {
    expect(part(sign(), "Signature")).toBe(part(sign(), "Signature"));
    expect(part(sign(), "Signature")).toHaveLength(64);
  });
});

describe("encodeObjectKey", () => {
  it("preserves slashes between path segments", () => {
    expect(encodeObjectKey("mkttool/2026/08/backup.sql")).toBe("mkttool/2026/08/backup.sql");
  });

  it("encodes spaces as %20 rather than plus signs", () => {
    expect(encodeObjectKey("backup file.sql")).toBe("backup%20file.sql");
  });

  /** `encodeURIComponent` bỏ sót đúng năm ký tự này, mà AWS đòi mã hóa cả chúng. */
  it("encodes !'()* characters omitted by encodeURIComponent", () => {
    expect(encodeObjectKey("a!b'c(d)e*f")).toBe("a%21b%27c%28d%29e%2Af");
  });

  it("preserves letters, digits, and -._~", () => {
    expect(encodeObjectKey("mkttool-prod_20260806.sql~1")).toBe("mkttool-prod_20260806.sql~1");
  });
});
