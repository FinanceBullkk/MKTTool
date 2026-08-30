/**
 * Đường đọc R2: `HEAD` để xem có gì, `GET` để lấy về.
 *
 * Hai bài quan trọng nhất ở đây không phải là "gọi được hay không":
 *
 *  - **404 phải là dữ liệu, không phải ngoại lệ.** Chưa phát hành gói nào là trạng thái bình
 *    thường, và trang tải phải in ra được việc phải làm. Ném lỗi ở đó là biến một màn hình hướng
 *    dẫn thành một trang "lỗi máy chủ".
 *  - **Metadata phải nằm trong danh sách header ĐƯỢC KÝ.** Thiếu, thì lượt `PUT` ăn HTTP 403
 *    `SignatureDoesNotMatch` — nhưng chỉ lộ ra ở lần phát hành thật, trên máy khác, vào lúc người
 *    ta đang vội.
 */
import { describe, expect, it, vi } from "vitest";
import {
  R2DownloadError,
  R2UploadError,
  getObject,
  headObject,
  putObject,
} from "./r2-client";
import type { R2Config } from "./r2-config";

const CONFIG: R2Config = {
  accountId: "acc123",
  bucket: "mkttool-relay",
  accessKeyId: "AKIAIOSFODNN7EXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

const KEY = "MKTTool-Relay.zip";

/** SHA-256 của chuỗi rỗng — thứ mọi request không có thân phải khai. */
const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function respond(status: number, headers: Record<string, string> = {}, body?: string): Response {
  return new Response(status === 204 || status === 404 ? null : (body ?? ""), { status, headers });
}

/**
 * `vi.fn` mang đúng chữ ký của `fetch`.
 *
 * Không khai tham số thì TypeScript suy ra kiểu đối số là tuple rỗng, và `mock.calls[0][1]` —
 * đúng chỗ bộ test này đọc header đã ký — thành lỗi biên dịch. Phản hồi dựng lại ở **mỗi** lượt
 * gọi vì thân một `Response` chỉ đọc được một lần.
 */
function fakeFetch(reply: () => Response) {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit) => Promise.resolve(reply()));
}

describe("headObject", () => {
  it("404 trả null chứ không ném", async () => {
    const fetchImpl = fakeFetch(() => respond(404));
    expect(await headObject({ config: CONFIG, key: KEY, fetchImpl })).toBeNull();
  });

  it("đọc dung lượng, mốc ghi và metadata tự đặt", async () => {
    const fetchImpl = fakeFetch(() => respond(200, {
        "content-length": "34078720",
        "last-modified": "Thu, 06 Aug 2026 06:36:14 GMT",
        "x-amz-meta-sha256": "abc123",
      }),
    );

    const info = await headObject({ config: CONFIG, key: KEY, fetchImpl });

    expect(info?.sizeBytes).toBe(34078720);
    expect(info?.lastModified.toISOString()).toBe("2026-08-06T06:36:14.000Z");
    // Tiền tố bị cắt: người gọi hỏi "sha256", không hỏi "x-amz-meta-sha256".
    expect(info?.metadata).toEqual({ sha256: "abc123" });
  });

  it("mốc ghi hỏng thì KHÔNG thành Invalid Date", async () => {
    // Một `Invalid Date` đi tiếp tới giao diện sẽ hiện ra "NaN" — màn hình mà người đọc không biết
    // phải tin gì nữa. Thà lệch vài giây.
    const fetchImpl = fakeFetch(() => respond(200, { "last-modified": "not-a-date" }));
    const info = await headObject({ config: CONFIG, key: KEY, fetchImpl });

    expect(Number.isNaN(info?.lastModified.getTime())).toBe(false);
  });

  // Bên gọi bỏ cuộc mà request vẫn chạy tiếp là nguồn gốc sự cố 30/08/2026: probe readiness quá
  // hạn ở 450 ms nhưng `HEAD` vẫn sống tới 15 s, và những request mồ côi đó chồng lên nhau đúng
  // lúc R2 đang chậm.
  it("hủy theo tín hiệu của bên gọi, không chờ hết hạn riêng", async () => {
    const controller = new AbortController();
    const fetchImpl = fakeFetch(() => respond(200));
    await headObject({ config: CONFIG, key: KEY, fetchImpl, signal: controller.signal });

    const passed = fetchImpl.mock.calls[0]![1]!.signal as AbortSignal;
    expect(passed.aborted).toBe(false);
    controller.abort();
    expect(passed.aborted).toBe(true);
  });

  it("ký bằng SHA-256 của thân RỖNG", async () => {
    // Khai sai băm payload là chữ ký lệch, và R2 chỉ nói "SignatureDoesNotMatch" — câu không chỉ
    // được chỗ sai.
    const fetchImpl = fakeFetch(() => respond(200));
    await headObject({ config: CONFIG, key: KEY, fetchImpl });

    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-amz-content-sha256"]).toBe(EMPTY_SHA256);
    expect(headers.Authorization).toContain("Credential=AKIAIOSFODNN7EXAMPLE/");
  });

  it("lỗi khác 404 thì ném KÈM thân phản hồi", async () => {
    // R2 nêu đích danh mã lỗi trong XML, và `AccessDenied` với `NoSuchBucket` dẫn tới hai việc
    // phải làm khác hẳn nhau. Còn mỗi "HTTP 403" thì không đi sửa được gì.
    const fetchImpl = fakeFetch(() => respond(403, {}, "<Error><Code>AccessDenied</Code></Error>"));

    await expect(headObject({ config: CONFIG, key: KEY, fetchImpl })).rejects.toThrow(
      R2DownloadError,
    );
    await expect(headObject({ config: CONFIG, key: KEY, fetchImpl })).rejects.toThrow(
      /AccessDenied/,
    );
  });
});

describe("getObject", () => {
  it("trả luồng đọc được, không phải buffer", async () => {
    const fetchImpl = fakeFetch(() => respond(200, { "content-length": "5" }, "hello"));
    const { body, info } = await getObject({ config: CONFIG, key: KEY, fetchImpl });

    expect(info.sizeBytes).toBe(5);
    expect(await new Response(body).text()).toBe("hello");
  });

  it("mất file giữa chừng thì ném — người gọi đã hỏi HEAD trước rồi", async () => {
    const fetchImpl = fakeFetch(() => respond(404));
    await expect(getObject({ config: CONFIG, key: KEY, fetchImpl })).rejects.toThrow(
      R2DownloadError,
    );
  });
});

describe("putObject", () => {
  it("metadata được thêm tiền tố và nằm trong danh sách header ĐƯỢC KÝ", async () => {
    const fetchImpl = fakeFetch(() => respond(200));
    await putObject({
      config: CONFIG,
      key: KEY,
      body: Buffer.from("gói"),
      contentType: "application/zip",
      metadata: { sha256: "deadbeef" },
      fetchImpl,
    });

    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["x-amz-meta-sha256"]).toBe("deadbeef");
    // Gửi header mà không ký nó thì R2 trả 403 — và chỉ ở lần phát hành thật mới lộ.
    expect(headers.Authorization).toContain("x-amz-meta-sha256");
  });

  it("không có metadata thì không sinh header thừa", async () => {
    const fetchImpl = fakeFetch(() => respond(200));
    await putObject({
      config: CONFIG,
      key: KEY,
      body: Buffer.from("x"),
      contentType: "application/sql",
      fetchImpl,
    });

    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(Object.keys(headers).some((name) => name.startsWith("x-amz-meta-"))).toBe(false);
  });

  it("ký điều kiện không ghi đè cho object bất biến", async () => {
    const fetchImpl = fakeFetch(() => respond(200));
    await putObject({
      config: CONFIG,
      key: "MKTTool-Relay-v7.zip",
      body: Buffer.from("x"),
      contentType: "application/zip",
      ifNoneMatch: "*",
      fetchImpl,
    });

    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["if-none-match"]).toBe("*");
    expect(headers.Authorization).toContain("if-none-match");
  });

  it("R2 từ chối thì ném R2UploadError", async () => {
    const fetchImpl = fakeFetch(() => respond(403, {}, "<Code>SignatureDoesNotMatch</Code>"));

    await expect(
      putObject({
        config: CONFIG,
        key: KEY,
        body: Buffer.from("x"),
        contentType: "application/zip",
        fetchImpl,
      }),
    ).rejects.toThrow(R2UploadError);
  });
});
