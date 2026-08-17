/**
 * Mọi khóa cố định trong repo phải qua được chính chốt mà repo này áp lên khóa thật.
 *
 * ## Vì sao có file này
 *
 * Chuyện đã xảy ra **hai lần**. C2 siết hạt giống khóa ký và làm CI đỏ ở sáu file `*.database.test`.
 * C33 siết khóa kho, người viết quét fixture trước theo đúng bài học đó — và vẫn đỏ ở hai file
 * nữa, vì phép quét dùng regex bắt hex viết thẳng, còn hai file kia viết `"21".repeat(32)`.
 *
 * Nguyên nhân chung không phải sự cẩu thả mà là **hình dạng của việc kiểm**: `*.database.test.ts`
 * cần Postgres nên không chạy dưới máy lập trình, tức fixture của chúng chỉ lộ ra ở CI, sau khi
 * đã đẩy. Còn phép quét tay thì đúng bằng đúng cái regex người ta nghĩ ra lúc đó.
 *
 * File này bỏ cả hai chỗ yếu: nó **liệt kê** fixture chứ không đi tìm, và nó **không cần
 * database**, nên một fixture hỏng đỏ ngay dưới máy thay vì ba phút sau trên CI.
 *
 * ## Vì sao không đọc bằng regex một dòng
 *
 * Fixture xuất hiện ở bốn dạng: hex viết thẳng, `"xx".repeat(n)`, một `const` khai chỗ khác trong
 * cùng file, và giá trị sinh lúc chạy (`randomBytes`). Ba dạng đầu phải giải ra được giá trị thật
 * mới kiểm được. Dạng thứ tư bỏ qua là đúng — nó vốn ngẫu nhiên.
 *
 * Gặp dạng thứ năm chưa biết thì file này **đỏ và nêu tên**, chứ không im lặng bỏ qua. Một phép
 * quét tự bỏ qua thứ nó không hiểu là phép quét kể lại chính điều người ta muốn nghe.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describePlaceholderSecret } from "./placeholder-secret-detection";

/** Gốc repo, từ `src/lib/crypto/` đi ngược ba tầng. */
const REPO_ROOT = path.resolve(__dirname, "../../..");

/** Nơi fixture có thể nằm. `.github` vào vì `ci.yml` cũng đặt hai biến khóa. */
const SCANNED_DIRS = ["src", "relay", "scripts", ".github"];

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".yml", ".yaml"]);

/** Ba biến giữ bí mật 32 byte do người điền. Cả ba đều có chốt khuôn mẫu. */
const KEY_ENV_NAMES = ["VAULT_KEY_SERVER", "VAULT_KEY_OPERATOR", "TICKET_SIGNING_KEY"] as const;

/**
 * Cách gọi GIÁN TIẾP tới đúng ba biến trên — `process.env[SERVER_SIGNING_KEY_ENV] = …`.
 *
 * Thiếu danh sách này thì file trên vô hình với phép quét, và ba file test cầu nối đang viết đúng
 * lối đó. Đây là điểm mù cùng loại với thứ đã sinh ra chính file này: một phép quét theo tên chỉ
 * bắt được cách viết mà người viết nó nghĩ ra. Ghi ra để lần sau ai thêm một tên gọi mới thì thêm
 * cả vào đây.
 *
 * **Ranh giới, nói thẳng để đừng ai đọc màu xanh của file này rộng hơn nó đáng:** đây là phép
 * quét tĩnh, tức một phép xấp xỉ. Một fixture đặt qua một tên gọi chưa có trong hai danh sách này
 * vẫn lọt. Nó thu hẹp chỗ hở chứ không đóng hẳn — thứ đóng hẳn là chính chốt lúc chạy.
 */
const KEY_ENV_ALIASES = [
  "SERVER_SIGNING_KEY_ENV",
  "VAULT_KEY_ENV.server",
  "VAULT_KEY_ENV.operator",
] as const;

const SCANNED_NAMES = [...KEY_ENV_NAMES, ...KEY_ENV_ALIASES];

/** `VAULT_KEY_ENV.server` có dấu chấm — không thoát thì nó khớp mọi ký tự. */
function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Giá trị sinh lúc chạy — không có gì để kiểm tĩnh, và vốn đã ngẫu nhiên. */
const DYNAMIC_RHS = /randomBytes|process\s*\.\s*env|VAULT_KEY_SERVER_HEX_FROM_ENV/;

interface Fixture {
  file: string;
  envName: string;
  raw: string;
  hex: string;
}

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (SCANNED_EXTENSIONS.has(path.extname(full))) {
      files.push(full);
    }
  }

  return files;
}

/** `"ab".repeat(32)` và `'ab'.repeat(32)`. */
const REPEAT_FORM = /^["'`]([0-9a-fA-F]+)["'`]\s*\.\s*repeat\(\s*(\d+)\s*\)/;

/** Hex viết thẳng, cho phép xuống dòng trước nó (prettier hay ngắt sau dấu `=`). */
const LITERAL_FORM = /^["'`]([0-9a-fA-F]{64})["'`]/;

/** Một định danh HẰNG trỏ tới `const` khai chỗ khác trong cùng file — quy ước UPPER_SNAKE. */
const CONSTANT_FORM = /^([A-Z][A-Z0-9_]*)\s*[;,\n]?/;

/**
 * Định danh viết thường: tham số hàm hoặc biến chạy, không phải fixture.
 *
 * `collect-ops-alerts.test.ts` dựng môi trường giả bằng `{ VAULT_KEY_SERVER: server }` với
 * `server` là tham số — không có giá trị tĩnh nào để kiểm, và nó cũng không đi qua `parseVaultKey`
 * (phép đọc thế đứng chỉ so hai chuỗi). Dấu `.` cũng tính, để bắt `serverSeed.toString("hex")` —
 * hạt giống dựng lúc chạy trong bài test cầu nối và trong script khói.
 *
 * Quy ước hằng số của repo là UPPER_SNAKE, nên chữ thường ở đây thật sự nghĩa là "tính lúc chạy".
 */
const RUNTIME_IDENTIFIER_FORM = /^[a-z_$][\w$]*\s*([.;,}\n)]|$)/;

/**
 * Chuỗi trong ngoặc nhưng không phải hex: không bao giờ là một khóa.
 *
 * Chỗ này bắt được câu khẳng định trong `encryption-key-loader.test.ts`, nơi dấu `=` nằm bên
 * trong một regex literal (`/VAULT_KEY_OPERATOR="<giá trị …>"/`) chứ không phải một phép gán.
 */
const NON_HEX_STRING_FORM = /^["'`][^"'`]*["'`]/;

/**
 * Tra vào một bảng hằng: `RFC_8032[0].seed`. Bỏ qua — và đây là **ngoại lệ duy nhất** được bỏ
 * qua mà không giải ra giá trị, nên nó cần một lý do đứng vững.
 *
 * Rút mọi chuỗi 64-hex trong bảng ra rồi kiểm hết là sai hướng: bảng vector còn chứa khóa công
 * khai và từng nửa chữ ký, và một bảng vector Ed25519 **đúng chuẩn** có chứa `00…00` — đó là
 * điểm bậc 4, xem `ed25519-point-validation.test.ts`. Đem chính sách chặn-khóa-điền-tạm áp lên
 * chúng là chặn nhầm đúng những giá trị bắt buộc phải có mặt.
 *
 * Còn giải đúng một đường `[0].seed` thì phải parse mảng object — thêm máy móc vào chính chỗ
 * đang làm lưới an toàn, mà máy móc trong lưới an toàn đã một lần sinh lỗi ở file này rồi.
 *
 * Bỏ qua được vì phạm vi thật của phép quét: nó sinh ra cho `*.database.test.ts`, thứ **không
 * chạy nổi dưới máy lập trình** vì cần Postgres, nên fixture của chúng chỉ được đánh giá lần đầu
 * ở CI. Bảng vector thì nằm trong test đơn vị chạy ở mọi lần `npm test` — một giá trị hỏng ở đó
 * làm đỏ bộ test trong vài giây, không cần phép quét này canh hộ.
 */
const VECTOR_TABLE_LOOKUP_FORM = /^[A-Z][A-Z0-9_]*\s*[[.]/;

/**
 * Cắt vế phải xuống đúng MỘT câu lệnh.
 *
 * Cửa sổ bắt là 120 ký tự nên nó tràn sang dòng sau, và dòng sau thường là một
 * `process.env.…` khác — thế là phép thử "giá trị động" khớp nhầm vào câu lệnh hàng xóm và fixture
 * hỏng bị bỏ qua **âm thầm**. Đúng lỗi đó đã làm file này xanh với một fixture `"21".repeat(32)`
 * nằm ngay trong repo; chỉ lộ ra khi cố tình trả fixture về giá trị hỏng để thử.
 *
 * Bỏ khoảng trắng đầu trước rồi mới cắt, vì prettier hay ngắt dòng ngay sau dấu `=`.
 */
function firstStatement(rhs: string): string {
  const leading = rhs.replace(/^\s+/, "");
  const end = leading.search(/[;\n]/);
  return (end === -1 ? leading : leading.slice(0, end)).trim();
}

/**
 * Giải một vế phải thành chuỗi hex, hoặc `null` nếu nó động (không cần kiểm),
 * hoặc ném nếu gặp dạng chưa biết.
 */
function resolveValue(rhs: string, source: string, depth = 0): string | null {
  const trimmed = firstStatement(rhs);

  if (DYNAMIC_RHS.test(trimmed)) return null;

  const literal = LITERAL_FORM.exec(trimmed);
  if (literal) return literal[1];

  const repeat = REPEAT_FORM.exec(trimmed);
  if (repeat) return repeat[1].repeat(Number(repeat[2]));

  if (RUNTIME_IDENTIFIER_FORM.test(trimmed)) return null;
  if (NON_HEX_STRING_FORM.test(trimmed)) return null;
  if (VECTOR_TABLE_LOOKUP_FORM.test(trimmed)) return null;

  // Một tầng gián tiếp là đủ cho mọi fixture đang có; đệ quy sâu hơn là mời một vòng lặp vào đây.
  if (depth === 0) {
    const constant = CONSTANT_FORM.exec(trimmed);
    if (constant) {
      const declaration = new RegExp(
        `const\\s+${constant[1]}\\s*(?::[^=]+)?=\\s*([\\s\\S]{0,120})`,
      ).exec(source);
      if (declaration) return resolveValue(declaration[1], source, depth + 1);
    }
  }

  throw new Error(`không giải được vế phải: ${trimmed.slice(0, 80)}`);
}

function collectFixtures(): { fixtures: Fixture[]; unresolved: string[] } {
  const fixtures: Fixture[] = [];
  const unresolved: string[] = [];

  for (const dir of SCANNED_DIRS) {
    for (const file of walk(path.join(REPO_ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(REPO_ROOT, file).replace(/\\/g, "/");

      // Bỏ qua chính bộ test của chốt: nó CỐ TÌNH chứa khóa điền tạm làm đầu vào bị từ chối.
      if (relative.includes("placeholder-hardening") || relative.includes("key-fixtures-pass")) {
        continue;
      }

      for (const envName of SCANNED_NAMES) {
        const pattern = new RegExp(`${escapeRegExp(envName)}["'\\]]?\\s*[:=]\\s*([\\s\\S]{0,120})`, "g");

        for (const match of source.matchAll(pattern)) {
          try {
            const hex = resolveValue(match[1], source);
            if (hex) fixtures.push({ file: relative, envName, raw: match[1].trim(), hex });
          } catch (error) {
            unresolved.push(`${relative} — ${envName}: ${(error as Error).message}`);
          }
        }
      }
    }
  }

  return { fixtures, unresolved };
}

const { fixtures, unresolved } = collectFixtures();

describe("khóa cố định trong repo phải qua được chốt khuôn mẫu", () => {
  it("tìm thấy fixture để kiểm — phép quét không được im lặng rỗng", () => {
    // Không có dòng này thì một regex hỏng biến cả file thành xanh vĩnh viễn mà không ai biết.
    // Con số chỉ cần là "nhiều", không cần chính xác: ghim số đúng là bắt người thêm test phải
    // sửa nó, và rồi họ sẽ hạ nó xuống.
    expect(fixtures.length).toBeGreaterThan(20);
  });

  it("giải được mọi dạng fixture đang có trong repo", () => {
    // Gặp dạng viết mới thì đỏ ở đây kèm tên file, thay vì bị bỏ qua âm thầm.
    expect(unresolved).toEqual([]);
  });

  it("mọi fixture đều qua được chốt", () => {
    const rejected = fixtures
      .map((fixture) => ({ fixture, reason: describePlaceholderSecret(Buffer.from(fixture.hex, "hex")) }))
      .filter((entry) => entry.reason !== null)
      .map((entry) => `${entry.fixture.file} — ${entry.fixture.envName} (${entry.reason})`);

    // Đỏ ở đây nghĩa là: fixture đó sẽ làm CI đỏ. Sửa fixture, đừng nới chốt.
    expect(rejected).toEqual([]);
  });

  it("mọi fixture đều đúng 32 byte", () => {
    const wrongLength = fixtures
      .filter((fixture) => fixture.hex.length !== 64)
      .map((fixture) => `${fixture.file} — ${fixture.envName} (${fixture.hex.length} ký tự)`);

    expect(wrongLength).toEqual([]);
  });
});
