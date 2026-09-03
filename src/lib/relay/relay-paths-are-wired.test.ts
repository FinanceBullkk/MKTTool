/**
 * Mọi đường khai trong hợp đồng đều phải được đấu dây thật ở cầu nối.
 *
 * ## Vì sao phép kiểm này đáng có
 *
 * `RELAY_PATHS` là giao kèo giữa **hai chương trình viết rời**: web app gọi theo nó, cầu nối phục
 * vụ theo nó. Thêm một đường vào hợp đồng mà quên đấu ở `main.ts` thì không có gì đỏ — TypeScript
 * thấy hằng số vẫn tồn tại, mọi test đơn vị của từng handler vẫn xanh. Thứ duy nhất lộ ra là một
 * nút bấm trả về 404 kèm câu *"nhiều khả năng web app và cầu nối lệch phiên bản"* — câu chỉ đúng
 * hướng nhưng chỉ nhầm nguyên nhân, và người đọc nó sẽ đi tìm bản `.exe` cũ.
 *
 * Ca đó vừa suýt xảy ra: bản mã mời thêm hai đường vào hợp đồng, và cả hai chỉ chạy được vì có
 * người nhớ sửa `main.ts`. Không có gì bắt buộc họ nhớ.
 *
 * ## Vì sao đọc mã nguồn thay vì gọi thử
 *
 * `main.ts` không export gì — nó gọi `main()` ngay lúc import, tức là dựng khóa, đọc file, và bật
 * cổng nghe. Import nó trong test là bật một cầu nối thật ở cổng 47821 giữa lúc chạy test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RELAY_PATHS } from "./relay-endpoints";

const MAIN = readFileSync(path.join(process.cwd(), "relay", "src", "main.ts"), "utf8");

describe("RELAY_PATHS", () => {
  it.each(Object.keys(RELAY_PATHS))("wires path %s in main.ts", (key) => {
    expect(
      MAIN.includes(`RELAY_PATHS.${key}`),
      `The contract declares "${key}", but relay/src/main.ts does not reference it.\n\n` +
        `Add [RELAY_PATHS.${key}]: ... to the "routes" or "htmlPages" table.\n` +
        `Declaring a path without wiring it makes the web app receive a 404 with a misleading ` +
        `version-mismatch message.`,
    ).toBe(true);
  });

  it("contains no trace of the removed invite-code paths", () => {
    // Hai đường này chở khóa vùng operator bằng một bí mật đối xứng gửi qua chat. Chúng được thay
    // bằng cách bọc cho riêng máy nhận — xem `handle-seal-operator-key.ts`. Giữ dòng này để cái
    // tên cũ không lặng lẽ quay lại trong một lần sửa vội.
    expect(JSON.stringify(RELAY_PATHS)).not.toContain("wrap-vault-key");
    expect(JSON.stringify(RELAY_PATHS)).not.toContain("consume-invite");
  });
});

/**
 * Đường giao khóa vùng operator không được đọc khóa máy chủ qua `identity`.
 *
 * `identity` chỉ dựng được khi cấu hình **hợp lệ trọn vẹn**, và "trọn vẹn" bao gồm
 * `vaultKeyOperator` — đúng thứ mà đường này sinh ra để mang xuống. Nối vào `identity` là khép một
 * vòng tròn: máy chưa có khóa thì không nhận được khóa.
 *
 * Ca này đã xảy ra thật, 18/08/2026. Một chiếc máy đã đăng ký, đã được cấp khóa **hai lần**, vẫn
 * trả về *"This Relay is not enrolled yet."* — câu chỉ nhầm hoàn toàn nguyên nhân, vì nó nói về
 * việc đăng ký trong khi thứ thiếu là một field khác. Máy chính của người viết cũng dính, và không
 * ai thấy: khoảng cách giữa lúc cấp và lúc nhận của nó là **mười ngày**, và nó chỉ xong khi khóa
 * về bằng đường chép tay.
 *
 * Đọc hình dạng mã nguồn chứ không gọi thử, cùng lý lẽ với phần trên: `main.ts` bật một cầu nối
 * thật ngay lúc import. Phép kiểm đơn vị của bản thân handler **không** bắt được ca này — handler
 * nhận `serverPublicKey` qua tham số nên nó luôn đúng; chỗ sai là chỗ chọn nguồn.
 */
describe("operator key delivery", () => {
  const KHOI_GIAO_KHOA = MAIN.slice(MAIN.indexOf("RELAY_PATHS.receiveOperatorKey"));
  // Bỏ dòng chú thích: khối này được giải thích khá dài ngay tại chỗ, và câu giải thích **phải**
  // nhắc tới `state.identity` để nói ra vì sao không dùng nó. Khẳng định trên mã đã bỏ chú thích
  // thì lời giải thích không tự làm đỏ phép kiểm mà nó đang giải thích.
  const deps = KHOI_GIAO_KHOA.slice(0, KHOI_GIAO_KHOA.indexOf("}),"))
    .split("\n")
    .filter((dong) => !dong.trim().startsWith("//"))
    .join("\n");

  it("reads the server key from state rather than identity", () => {
    expect(
      deps.includes("serverPublicKey: state.serverPublicKey"),
      'The "receiveOperatorKey" path must receive `serverPublicKey: state.serverPublicKey`.\n\n' +
        "Connecting it to `state.identity` creates a cycle: `identity` requires complete " +
        "configuration, complete configuration requires `vaultKeyOperator`, and this path " +
        'delivers `vaultKeyOperator`. The PC would report "This Relay is not enrolled yet." even when registered.',
    ).toBe(true);
  });

  it("does not read identity on this path", () => {
    expect(deps).not.toContain("state.identity");
  });
});
