/**
 * Mọi đường dẫn trong luồng chuẩn bị phải trỏ tới chỗ người dùng **làm được việc**.
 *
 * ## Vì sao một phép kiểm chỉ để canh mấy cái link
 *
 * Ngày 18/08/2026 có ba chỗ chỉ operator sang `/relay-devices` để ghi máy vào sổ — một trang mà
 * `registerRelayDevice` là `adminAction`, nên operator bấm vào không làm được gì. Thẻ hướng dẫn đã
 * chuyển sang `/setup` từ trước đó. Nặng nhất là câu từ chối ở thẻ kho bí mật: nó hiện **đúng lúc**
 * người ta bị chặn, và nó chỉ sai đường ra — tệ hơn một câu không chỉ gì, vì người đọc tin nó.
 *
 * Không phép kiểm nào đỏ, vì không phép kiểm nào canh link. TypeScript thấy một chuỗi hợp lệ; bộ
 * test thấy một component render ra. Thứ duy nhất phát hiện là một người thật đi hết đường đó, và
 * người thật đầu tiên đi hết nó là bốn tháng sau khi trang được viết.
 *
 * Check literal routes where they are owned. The profile card delegates its route to a readiness
 * helper and shared status component, so also verify that real helper-to-render contract.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileSetupStatus } from "@/components/vault/profile-setup-status";
import { profileSetupReadiness } from "@/lib/relay/profile-setup-readiness";
import { effectiveMinRelayVersion, TICKET_KINDS } from "@/lib/tickets/ticket-types";

function doc(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

/** Những chỗ nói với operator "đi tải cầu nối đi". */
const NOI_CHI_DUONG_TAI = [
  ["src", "lib", "setup", "setup-state-machine.ts"],
  ["src", "components", "relay", "relay-outdated-notice.tsx"],
  ["src", "lib", "relay", "profile-setup-readiness.ts"],
];

describe("setup flow links", () => {
  it.each(NOI_CHI_DUONG_TAI)("%s/%s/%s/%s no longer points to the old download page", (...segments) => {
    const source = doc(...segments);
    expect(
      source.includes("/relay-download"),
      `${segments.join("/")} still points to "/relay-download". Downloads now live at "/setup#download". ` +
        "The old page only redirects, so this link makes the operator take an unnecessary redirect " +
        "instead of going directly to the available action.",
    ).toBe(false);
    expect(source).toContain("/setup#download");
  });

  it("renders the real outdated profile-setup action directly at the download anchor", () => {
    const version = effectiveMinRelayVersion(TICKET_KINDS.CREATE_PROFILE) - 1;
    const state = profileSetupReadiness(
      { status: "rejected", relayVersion: version, message: "Synthetic old Relay" },
      { status: "rejected", relayVersion: version, message: "Synthetic old Relay" },
    );
    expect(state).toMatchObject({ kind: "blocked", state: "relay-outdated", setupHref: "/setup#download" });
    if (state.kind !== "blocked") throw new Error("Expected measured outdated Relay state");
    const markup = renderToStaticMarkup(createElement(ProfileSetupStatus, {
      state, checking: false, onRetry: () => undefined,
    }));
    const hrefs = Array.from(markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g), (match) => match[1]);
    expect(hrefs).toEqual(["/setup#download"]);
    expect(markup).toContain("Set up this Relay PC</a>");
    expect(markup).not.toContain("/relay-download");
    expect(doc("src", "components", "vault", "antidetect-profile-card.tsx")).not.toContain("/relay-download");
  });

  it("keeps the download anchor targeted by every setup link", () => {
    // Không có `id="download"` thì mọi `#download` ở trên rơi vào đầu trang, và người tới từ dải
    // "cầu nối bản cũ" phải tự dò xuống — im lặng, không có gì hỏng để mà thấy.
    expect(doc("src", "components", "setup", "relay-download-section.tsx")).toContain('id="download"');
  });

  it("renders the anchored Relay download section on the setup page", () => {
    const page = doc("src", "app", "setup", "page.tsx");
    expect(page).toContain('import { RelayDownloadSection }');
    expect(page).toContain("<RelayDownloadSection");
  });

  it("keeps the old download page as a redirect", () => {
    // Xóa hẳn thì địa chỉ nằm trong tài liệu vận hành và trong tin nhắn cũ ăn 404, và người đọc
    // kết luận công cụ hỏng chứ không kết luận là trang đã dọn đi chỗ khác.
    const page = doc("src", "app", "relay-download", "page.tsx");
    expect(page).toContain("redirect");
    expect(page).toContain("/setup#download");
  });

  it("uses the existing authenticated Relay release channel", () => {
    const section = doc("src", "components", "setup", "relay-download-section.tsx");
    expect(section).toContain('href="/api/relay/download"');
    expect(section).not.toContain("/api/setup/windows-installer");
  });
});
