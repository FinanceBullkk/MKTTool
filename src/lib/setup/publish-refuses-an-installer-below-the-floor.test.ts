/**
 * Đường phát hành gói cài phải TỪ CHỐI một gói mang cầu nối dưới sàn.
 *
 * ## Vì sao phép kiểm này tồn tại
 *
 * 18/08/2026, C39 nâng `MIN_RELAY_VERSION` lên 13 và không ai ghim lại payload bên MKTBrowser. MKT
 * Browser 0.3.1 tiếp tục mang cầu nối bản 12, nên **mọi máy cài xong đều bị máy chủ từ chối** — và
 * cài một cầu nối mới trước cũng không cứu được, vì lần cài trình duyệt kế tiếp lại kéo nó xuống.
 *
 * Không có gì chặn được. Gói đi qua build, qua publish, lên ngăn phát hành, xuống máy người dùng,
 * và chỗ duy nhất phát hiện ra là một chiếc máy thật bị từ chối. Sàn thì nằm trong mã nguồn máy
 * chủ, bản trong ruột gói thì nằm trong metadata — hai con số so được với nhau, chưa ai so.
 *
 * ## Vì sao đọc mã nguồn thay vì gọi script
 *
 * Script cần chìa ghi R2 thật và một file `.exe` thật. Cái phải giữ ở đây không phải hành vi lúc
 * chạy mà là **chốt chặn có nằm trong mã hay không** — cùng lối với
 * `setup-links-point-where-the-work-is.test.ts`: cái sai nằm ở chỗ thiếu một câu lệnh, không nằm
 * trong một nhánh nào dựng lại được.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MIN_RELAY_VERSION } from "@/lib/tickets/ticket-types";

const NGUON = readFileSync(
  path.join(process.cwd(), "scripts", "publish-windows-installer.ts"),
  "utf8",
);

describe("publish-windows-installer", () => {
  it("so bản cầu nối trong ruột với sàn, và thoát khác 0 khi thấp hơn", () => {
    expect(NGUON).toContain("MIN_RELAY_VERSION");
    expect(NGUON).toMatch(/if \(relayVersion < MIN_RELAY_VERSION\)/);
    // Chốt chặn phải DỪNG, không chỉ cảnh báo. Một dòng in đỏ rồi vẫn đẩy lên là đúng thứ đã xảy ra.
    const chot = NGUON.slice(NGUON.indexOf("if (relayVersion < MIN_RELAY_VERSION)"));
    expect(chot.slice(0, chot.indexOf("\n  }"))).toContain("process.exit(1)");
  });

  it("đòi --relay-version, và không bịa ra số khi thiếu", () => {
    expect(NGUON).toContain('flag("relay-version")');
    // Nằm trong mệnh đề thiếu-tham-số cùng với hai cờ kia, nên quên là không chạy được.
    expect(NGUON).toMatch(/!filePath \|\| !version \|\| !candidateId \|\| !relayVersionRaw/);
    expect(NGUON).toContain('flag("candidate-id")');
  });

  it("ghi con số đó vào metadata, nếu không thì trang chuẩn bị chẳng đọc được gì", () => {
    expect(NGUON).toContain("WINDOWS_INSTALLER_RELAY_VERSION_METADATA_KEY");
  });

  it("sàn hiện tại là số dương — phép so ở trên chỉ có nghĩa khi sàn có nghĩa", () => {
    expect(Number.isSafeInteger(MIN_RELAY_VERSION)).toBe(true);
    expect(MIN_RELAY_VERSION).toBeGreaterThan(0);
  });
});
