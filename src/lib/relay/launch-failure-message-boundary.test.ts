/**
 * Mọi nút mở profile phải lọc câu báo hỏng của cầu nối qua `describeProfileLaunchFailure()`.
 *
 * ## Vì sao là phép kiểm hình dạng mã nguồn
 *
 * Kiểu hỏng này không làm test nào đỏ. Cầu nối từ chối mở profile thì câu nó trả về được ghép
 * bằng `${describe(error)}` (`relay/src/launch-profile.ts`), tức mang nguyên văn lỗi của engine —
 * chuỗi kết nối proxy, khóa licence, đường dẫn máy. Một trang hiện thẳng câu đó vẫn chạy đúng,
 * vẫn xanh, và chỉ sai vào đúng lúc có sự cố. `describeProfileLaunchFailure()` tra theo **mã**
 * và không bao giờ chuyển tiếp câu gốc — xem test "maps launch failures by stable code without
 * forwarding internal messages" ở `profile-launch-readiness.test.ts`.
 *
 * Cùng họ với `relay-import-boundary.test.ts`: kiểu hỏng nào không làm test nào đỏ thì phải có
 * một phép kiểm nhắm thẳng vào nó.
 *
 * ## Vì sao nó quay lại được
 *
 * Đã xảy ra thật: bảng profile (`ProfileTable`, `ProfileTile`) lọc từ đầu, còn nút mở ở trang chi
 * tiết nick thì chép thẳng câu của cầu nối. Hai nút mở **cùng một profile**, hai câu khác nhau —
 * và nút chưa lọc cũng là nút nuốt mất `NO_CAPACITY`, tức lời giải thích duy nhất cho việc một key
 * CloakBrowser chỉ mở được một phiên.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Mọi file mã nguồn dưới một thư mục, bỏ qua thư mục build. Viết tại chỗ như các phép canh biên
 *  giới khác trong repo: một phép canh mà đi mượn code thì mất cùng lúc với thứ nó canh. */
function collectSourceFiles(root: string, relative = ""): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...collectSourceFiles(root, next));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(next);
  }

  return files;
}

/** Gọi cầu nối để MỞ profile: vừa gửi vé, vừa chạm tới route phát vé mở. */
function isLaunchSurface(source: string): boolean {
  return source.includes("sendTicketToRelay(") && source.includes("/launch");
}

describe("launch failure message boundary", () => {
  it("routes every launch rejection through the code-mapped description", () => {
    const root = process.cwd();
    const offenders = collectSourceFiles(root, "src")
      .map((file) => ({ file, source: readFileSync(path.join(root, file), "utf8") }))
      .filter(({ source }) => isLaunchSurface(source))
      .filter(({ source }) => !source.includes("describeProfileLaunchFailure"))
      .map(({ file }) => file);

    expect(
      offenders,
      "These files open a browser profile but show the Relay message as-is. Use " +
        "describeProfileLaunchFailure() so the engine's own error text never reaches the page.",
    ).toEqual([]);
  });

  it("finds the launch surfaces it is meant to guard", () => {
    const root = process.cwd();
    const surfaces = collectSourceFiles(root, "src")
      .map((file) => readFileSync(path.join(root, file), "utf8"))
      .filter(isLaunchSurface);

    // Không có surface nào nghĩa là phép kiểm trên đang xanh vì không tìm thấy gì để kiểm.
    expect(surfaces.length).toBeGreaterThanOrEqual(3);
  });
});
