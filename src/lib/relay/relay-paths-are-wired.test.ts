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
