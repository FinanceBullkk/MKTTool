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
  it.each(Object.keys(RELAY_PATHS))("đường %s được đấu dây trong main.ts", (key) => {
    expect(
      MAIN.includes(`RELAY_PATHS.${key}`),
      `Hợp đồng khai "${key}" nhưng relay/src/main.ts không nhắc tới nó.\n\n` +
        `Thêm vào bảng "routes" (hoặc "htmlPages") một dòng [RELAY_PATHS.${key}]: …\n` +
        `Khai mà không đấu thì web app gọi vào sẽ ăn 404 kèm câu nói về lệch phiên bản — ` +
        `câu chỉ nhầm nguyên nhân.`,
    ).toBe(true);
  });

  it("không còn dấu vết của đường mã mời đã gỡ", () => {
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
describe("giao khóa vùng operator", () => {
  const KHOI_GIAO_KHOA = MAIN.slice(MAIN.indexOf("RELAY_PATHS.receiveOperatorKey"));
  // Bỏ dòng chú thích: khối này được giải thích khá dài ngay tại chỗ, và câu giải thích **phải**
  // nhắc tới `state.identity` để nói ra vì sao không dùng nó. Khẳng định trên mã đã bỏ chú thích
  // thì lời giải thích không tự làm đỏ phép kiểm mà nó đang giải thích.
  const deps = KHOI_GIAO_KHOA.slice(0, KHOI_GIAO_KHOA.indexOf("}),"))
    .split("\n")
    .filter((dong) => !dong.trim().startsWith("//"))
    .join("\n");

  it("lấy khóa máy chủ từ state, không qua identity", () => {
    expect(
      deps.includes("serverPublicKey: state.serverPublicKey"),
      'Đường "receiveOperatorKey" phải nhận `serverPublicKey: state.serverPublicKey`.\n\n' +
        "Nối nó vào `state.identity` là khép vòng tròn: `identity` cần cấu hình đủ, cấu hình đủ " +
        "cần `vaultKeyOperator`, và `vaultKeyOperator` là thứ đường này mang xuống. Máy sẽ báo " +
        '"This Relay is not enrolled yet." dù nó đã ở trong sổ.',
    ).toBe(true);
  });

  it("không đọc identity ở đường này nữa", () => {
    expect(deps).not.toContain("state.identity");
  });
});
