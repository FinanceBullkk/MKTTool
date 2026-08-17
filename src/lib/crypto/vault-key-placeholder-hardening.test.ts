/**
 * FINDING C33: `parseVaultKey` có chặn một khóa kho điền tạm không?
 *
 * C2 đã bịt đúng lỗ này cho hạt giống khóa ký vài giờ trước đó. Lỗ ở đây **nặng hơn** chứ không
 * nhẹ hơn, và đây là lý do nó đáng một file riêng thay vì một dòng thêm vào bài test cũ:
 *
 *   - Đoán được hạt giống ký thì giả được **quyền** — vé, quyền cập nhật, quyền lùi bản. Xấu, và
 *     xoay khóa là dứt điểm.
 *   - Đoán được `VAULT_KEY_OPERATOR` thì đọc ra **chữ**: mật khẩu nick, mật khẩu email, mã TOTP.
 *     Không xoay lại được, vì mọi bản sao lưu từng rời khỏi máy vẫn mở bằng đúng khóa đó. Một bản
 *     dump database lộ ra sau này cộng với khóa `00…00` là bằng đúng chuyện lộ cả kho ở dạng chữ.
 *
 * Đường tới lỗ giống hệt C2: không phải kẻ tấn công, mà là người vận hành dán một giá trị cho qua
 * chuyện lúc dựng máy rồi để nguyên. Không ai khác điền hai biến này.
 *
 * Bài test không đo thuật toán mã hóa — nó đo **chính sách nhận khóa**. Mọi chuỗi bị từ chối dưới
 * đây đều là hex hợp lệ, đúng 64 ký tự, và là khóa AES-256 hợp lệ về mặt toán học; không thư viện
 * mã hóa nào phàn nàn về chúng. Chỉ một chính sách khuôn mẫu mới bắt được, nên nếu chính sách đó
 * biến mất thì file này là thứ duy nhất đỏ lên.
 *
 * Khóa tổng hợp toàn bộ. Không đụng dữ liệu thật, không đụng database.
 */
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  VAULT_KEY_BYTES,
  VAULT_KEY_HEX_LENGTH,
  VaultKeyError,
  parseVaultKey,
} from "./encryption-key-loader";

const SOURCE = "VAULT_KEY_OPERATOR";

/** Nhận hay không, không quan tâm lỗi gì — để so accept/reject theo từng đầu vào. */
function accepts(raw: string | undefined, options?: { allowPlaceholder?: boolean }): boolean {
  try {
    parseVaultKey(raw, SOURCE, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Đúng những khuôn mà một người gõ tay hay để lại. Mỗi chuỗi là hex hợp lệ, đúng độ dài — tức
 * hai phép kiểm đã có từ trước **không** bắt được chuỗi nào trong số này.
 */
const PLACEHOLDERS: ReadonlyArray<readonly [string, string]> = [
  ["toàn số 0", "00".repeat(VAULT_KEY_BYTES)],
  ["toàn 0xff", "ff".repeat(VAULT_KEY_BYTES)],
  ["một byte lặp lại", "ab".repeat(VAULT_KEY_BYTES)],
  ["khối 2 byte lặp lại", "dead".repeat(VAULT_KEY_BYTES / 2)],
  ["khối 4 byte lặp lại", "deadbeef".repeat(VAULT_KEY_BYTES / 4)],
  /**
   * Khối 16 byte — hai nửa giống hệt nhau, chu kỳ dài nhất còn lặp được trong 32 byte.
   *
   * Đây từng là điểm mù: luật cũ chỉ xét tới chu kỳ 8. Và nó không phải khuôn lý thuyết — đúng
   * chuỗi này là fixture của `ci.yml` và mười một file test trong repo cho tới 17/08/2026, tức
   * bằng chứng rõ nhất rằng người ta thật sự gõ ra khuôn đó.
   */
  ["khối 16 byte lặp lại", "00112233445566778899aabbccddeeff".repeat(2)],
  [
    "dãy đếm tăng",
    Array.from({ length: VAULT_KEY_BYTES }, (_, i) => i.toString(16).padStart(2, "0")).join(""),
  ],
  [
    "dãy đếm giảm",
    Array.from({ length: VAULT_KEY_BYTES }, (_, i) => (255 - i).toString(16).padStart(2, "0")).join(
      "",
    ),
  ],
];

describe("C33: khóa kho điền tạm", () => {
  it.each(PLACEHOLDERS)("từ chối khóa %s", (_label, raw) => {
    // Khẳng định đầu vào đúng là thứ hai phép kiểm cũ cho lọt, trước khi khẳng định chốt mới bắt
    // được nó. Thiếu bước này thì một lần xanh ở đây không chứng minh điều gì về chính sách.
    expect(raw).toHaveLength(VAULT_KEY_HEX_LENGTH);
    expect(Buffer.from(raw, "hex")).toHaveLength(VAULT_KEY_BYTES);

    expect(accepts(raw)).toBe(false);
    expect(() => parseVaultKey(raw, SOURCE)).toThrow(VaultKeyError);
  });

  it("nói rõ luật nào vừa nổ và đi đường nào tiếp", () => {
    // Một phép từ chối không hành động được thì người ta đi vòng qua nó chứ không sửa. Câu báo
    // phải tách được hai tình huống, vì lối thoát của chúng ngược nhau: máy chưa có dữ liệu thì
    // sinh khóa mới; máy đã chạy thật thì đổi .env tay là mất sạch dữ liệu.
    const raw = "00".repeat(VAULT_KEY_BYTES);

    expect(() => parseVaultKey(raw, SOURCE)).toThrow(/điền tạm/);
    expect(() => parseVaultKey(raw, SOURCE)).toThrow(/byte/);
    expect(() => parseVaultKey(raw, SOURCE)).toThrow(/vault:keygen/);
    expect(() => parseVaultKey(raw, SOURCE)).toThrow(/vault:rekey/);
    expect(() => parseVaultKey(raw, SOURCE)).toThrow(new RegExp(SOURCE));
  });

  /**
   * Nửa còn lại của chốt, và là nửa hỏng nặng hơn nếu sai. Một chính sách từ chối nhầm khóa thật
   * không phải là "hơi phiền": nó khóa người dùng ra ngoài kho dữ liệu của chính họ, và dữ liệu
   * đó không có bản mở nào khác.
   */
  it("nhận khóa ngẫu nhiên thật — 200 khóa, không từ chối nhầm lần nào", () => {
    for (let i = 0; i < 200; i += 1) {
      const raw = randomBytes(VAULT_KEY_BYTES).toString("hex");
      expect(accepts(raw), `khóa thật ${raw}`).toBe(true);
    }
  });

  it("nhận khóa do chính vault:keygen sinh ra", () => {
    // Cùng một lời gọi mà script keygen dùng. Chốt mà chặn đầu ra của công cụ sinh khóa của chính
    // repo này thì hỏng theo kiểu tệ nhất: đúng người làm đúng việc lại bị chặn.
    for (let i = 0; i < 20; i += 1) {
      expect(accepts(randomBytes(VAULT_KEY_BYTES).toString("hex"))).toBe(true);
    }
  });

  it("trả về đúng 32 byte khi nhận", () => {
    const raw = randomBytes(VAULT_KEY_BYTES).toString("hex");
    expect(parseVaultKey(raw, SOURCE)).toHaveLength(VAULT_KEY_BYTES);
  });
});

/**
 * Lối thoát cho người đã lỡ chạy thật bằng một khóa điền tạm.
 *
 * Nếu chốt chặn cả ở đây thì nó nhốt người ta lại với chính lỗi vừa phát hiện: khóa xấu không
 * dùng tiếp được, mà dữ liệu mã hóa bằng nó cũng không lấy ra được. `vault:rekey` là đường duy
 * nhất đi ra, nên nó phải đọc được đúng thứ mà đường nạp thường đã cấm.
 */
describe("C33: đường xoay khóa vẫn đọc được khóa cũ đã hỏng", () => {
  it.each(PLACEHOLDERS)("đọc được khóa %s khi khai allowPlaceholder", (_label, raw) => {
    expect(accepts(raw, { allowPlaceholder: true })).toBe(true);
    expect(parseVaultKey(raw, SOURCE, { allowPlaceholder: true })).toHaveLength(VAULT_KEY_BYTES);
  });

  it("nới khuôn mẫu thì vẫn giữ nguyên phép kiểm độ dài và bảng chữ", () => {
    // `allowPlaceholder` chỉ được nới đúng một luật. Nếu nó nới luôn cả hai phép kiểm kia thì
    // đường xoay khóa trở thành một lối vòng qua toàn bộ phép kiểm — đúng thứ không được phép.
    expect(accepts("abcd", { allowPlaceholder: true })).toBe(false);
    expect(accepts("z".repeat(VAULT_KEY_HEX_LENGTH), { allowPlaceholder: true })).toBe(false);
    expect(accepts(undefined, { allowPlaceholder: true })).toBe(false);
    expect(accepts("", { allowPlaceholder: true })).toBe(false);
  });

  it("mặc định là CHẶT — không khai gì thì khuôn mẫu vẫn bị từ chối", () => {
    // Thứ tự tham số khiến một lỗi gõ tay (`parseVaultKey(raw, source, someTruthyThing)`) có thể
    // âm thầm mở chốt. Pin mặc định lại để lỗi ấy phải đi qua một bài test đỏ.
    const raw = "00".repeat(VAULT_KEY_BYTES);
    expect(accepts(raw)).toBe(false);
    expect(accepts(raw, {})).toBe(false);
    expect(accepts(raw, { allowPlaceholder: false })).toBe(false);
  });
});
