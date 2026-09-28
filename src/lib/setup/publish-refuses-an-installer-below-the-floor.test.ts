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
import {
  assertWindowsInstallerCandidateCanBePublished,
  WINDOWS_INSTALLER_CANDIDATE,
  WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR,
} from "./windows-installer-candidate";

const NGUON = readFileSync(
  path.join(process.cwd(), "scripts", "publish-windows-installer.ts"),
  "utf8",
);

describe("publish-windows-installer", () => {
  it("rejects a candidate below the active profile-action floor before R2 access", () => {
    expect(WINDOWS_INSTALLER_CANDIDATE.relayVersion).toBeGreaterThanOrEqual(
      WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR,
    );
    expect(() => assertWindowsInstallerCandidateCanBePublished({
      id: WINDOWS_INSTALLER_CANDIDATE.id,
      promotionStatus: "eligible",
      relayVersion: WINDOWS_INSTALLER_PROFILE_ACTION_RELAY_FLOOR - 1,
    })).toThrow(/profile-action.*v20/i);
    expect(NGUON).toContain("assertWindowsInstallerCandidateCanBePublished()");
    // Chốt chặn phải DỪNG, không chỉ cảnh báo. Một dòng in đỏ rồi vẫn đẩy lên là đúng thứ đã xảy ra.
    const publicationGate = NGUON.indexOf(
      "assertWindowsInstallerCandidateCanBePublished()",
      NGUON.indexOf("async function main"),
    );
    expect(publicationGate).toBeGreaterThanOrEqual(0);
    expect(publicationGate).toBeLessThan(NGUON.indexOf("readR2Config(process.env"));
  });

  it("requires --relay-version and does not invent a value when it is missing", () => {
    expect(NGUON).toContain('flag("relay-version")');
    // Nằm trong mệnh đề thiếu-tham-số cùng với hai cờ kia, nên quên là không chạy được.
    expect(NGUON).toMatch(/!filePath \|\| !version \|\| !candidateId \|\| !relayVersionRaw/);
    expect(NGUON).toContain('flag("candidate-id")');
  });

  it("writes the Relay version to metadata so the setup page can read it", () => {
    expect(NGUON).toContain("WINDOWS_INSTALLER_RELAY_VERSION_METADATA_KEY");
  });

  it("locks publication to the current candidate instead of a stale Relay literal", () => {
    expect(NGUON).toContain("WINDOWS_INSTALLER_CANDIDATE.relayVersion");
    expect(NGUON).toContain('requiredPositiveInteger(relay.targetVersion, "relay.targetVersion")');
    expect(WINDOWS_INSTALLER_CANDIDATE.relayVersion).toBe(21);
    expect(WINDOWS_INSTALLER_CANDIDATE.promotionStatus).toBe("eligible");
    expect(NGUON).not.toContain("relayVersion !== 16");
    expect(NGUON).not.toContain("expected.relayVersion !== 16");
    expect(NGUON).not.toContain("relayVersion: 16");
  });

});
