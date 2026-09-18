/**
 * MKTTool chép lại contract của MKT Browser. Phép kiểm này canh ba bản chép đó khớp nhau.
 *
 * ## Vì sao có hai bản, và vì sao không gộp
 *
 * `mkt-browser-contract.ts` khai lại những hằng số mà `MKTBrowser/packages/types` đã khai. Đó là
 * cố ý: hai repo tách nhau, web app không import được mã nguồn của `.exe`, và một package dùng
 * chung sẽ buộc hai lịch phát hành phải đi cùng nhau. Cái giá phải trả là **bản chép trôi đi mà
 * không ai biết**.
 *
 * ## Trôi thì hỏng kiểu gì
 *
 * Thêm một mã lỗi ở Browser mà quên thêm bên này: MKTTool rơi vào nhánh "mã lạ, dùng câu chung",
 * tức người dùng mất đúng câu giải thích dành cho lỗi vừa xảy ra. Hỏng **an toàn** — không sai kết
 * quả — nên không test nào đỏ, không ai phát hiện, và nó tích lại qua từng bản Browser. Đúng họ với
 * `relay-import-boundary.test.ts`: kiểu hỏng nào không làm test nào đỏ thì phải có một phép kiểm
 * nhắm thẳng vào nó.
 *
 * ## Vì sao có bản chụp ở giữa, thay vì so thẳng hai repo
 *
 * Máy CI của repo này không checkout MKTBrowser, mà repo này **không có một test nào bị bỏ qua** —
 * và đó là chủ ý, vì luật của dự án là không đọc một bước bị bỏ qua thành một bước đạt. Một phép
 * kiểm chỉ chạy được ở một chỗ thì ở mọi chỗ khác nó là lời nói dối màu xanh.
 *
 * Nên bản chụp `desktop-contract-snapshot.json` đứng giữa, và phép kiểm đi hai chặng:
 *
 * | Chặng | Chạy ở đâu | Bắt được gì |
 * |---|---|---|
 * | Hằng số MKTTool ↔ bản chụp | **mọi máy**, kể cả CI | Sửa `mkt-browser-contract.ts` mà lệch giao kèo |
 * | Bản chụp ↔ file gốc bên Browser | máy có đủ hai repo | Browser đổi contract mà chưa ai chép sang |
 *
 * Chặng hai đỏ thì làm mới bản chụp bằng lệnh ghi trong `_refresh` của chính file JSON đó — và làm
 * mới xong thường sẽ làm **chặng một** đỏ, vì mã mới chưa có trong danh sách của MKTTool. Đó là
 * đường đi đúng: bản chụp kéo sự thay đổi về, chặng một bắt phần MKTTool còn thiếu.
 *
 * ## Vì sao đọc mã nguồn chứ không import
 *
 * `packages/types` nằm ngoài `rootDir` của repo này và không có trong `package.json`. Đọc văn bản
 * là cách duy nhất không kéo theo một phụ thuộc build giữa hai repo — mà chính việc tránh phụ thuộc
 * đó là lý do có hai bản chép ngay từ đầu.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_MANAGED_BROWSER_CAPABILITIES,
  REQUIRED_SETUP_BROWSER_CAPABILITIES,
} from "@/lib/relay/current-device-browser-health";
import snapshot from "./desktop-contract-snapshot.json";
import {
  MKT_BROWSER_DEFAULT_MCP_PORT,
  MKT_BROWSER_ERROR_CODES,
  MKT_BROWSER_PROVIDER_SLUG,
  MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS,
} from "./mkt-browser-contract";

const SNAPSHOT_FILE = path.join(process.cwd(), "src/lib/antidetect/desktop-contract-snapshot.json");

/** Đường tới `packages/types/src/index.ts` của MKTBrowser, hoặc `null` nếu không có repo đó. */
function resolveDesktopContractFile(): string | null {
  const repo = process.env.MKT_BROWSER_REPO ?? path.resolve(process.cwd(), "..", "MKTBrowser");
  const file = path.join(repo, "packages", "types", "src", "index.ts");
  return existsSync(file) ? file : null;
}

/**
 * Lấy một hằng mảng chuỗi ra khỏi mã nguồn, giải luôn phần tử trải (`...TEN_KHAC`) nếu có.
 *
 * Đủ cho hình dạng mà file kia đang dùng — mảng `as const` viết mỗi phần tử một dòng, có chú thích
 * xen giữa. Không phải parser TypeScript, và cố ý không: một parser thật ở đây là một phụ thuộc mới
 * để canh một file mà hình dạng đã ổn định qua nhiều bản. Đọc ra rỗng thì ném lỗi chứ không trả
 * mảng rỗng, vì một phép so hai mảng rỗng là một phép kiểm luôn xanh.
 */
function stringArrayConst(source: string, name: string, seen = new Set<string>()): string[] {
  if (seen.has(name)) throw new Error(`Vòng lặp khi giải hằng ${name}.`);
  seen.add(name);

  const match = new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`).exec(source);
  if (!match) throw new Error(`Không tìm thấy hằng mảng ${name} trong contract của desktop.`);

  const values: string[] = [];
  for (const line of match[1].split("\n")) {
    const spread = /^\s*\.\.\.([A-Z_][A-Z0-9_]*)\s*,?\s*$/.exec(line);
    if (spread) {
      values.push(...stringArrayConst(source, spread[1], seen));
      continue;
    }
    const entry = /^\s*"([^"]+)"\s*,?\s*$/.exec(line);
    if (entry) values.push(entry[1]);
  }

  if (values.length === 0) throw new Error(`Hằng ${name} đọc ra rỗng — hình dạng file đã đổi.`);
  return values;
}

/** Lấy một hằng số nguyên, chấp nhận dấu gạch dưới ngăn nhóm (`47_822`). */
function numberConst(source: string, name: string): number {
  const match = new RegExp(`export const ${name} = ([0-9_]+);`).exec(source);
  if (!match) throw new Error(`Không tìm thấy hằng số ${name} trong contract của desktop.`);
  return Number(match[1].replaceAll("_", ""));
}

/** Lấy một hằng chuỗi. */
function stringConst(source: string, name: string): string {
  const match = new RegExp(`export const ${name} = "([^"]*)";`).exec(source);
  if (!match) throw new Error(`Không tìm thấy hằng chuỗi ${name} trong contract của desktop.`);
  return match[1];
}

/** Phần contract mà MKTTool quan tâm, đọc ra khỏi file gốc bên Browser. */
function readDesktopContract(file: string) {
  const source = readFileSync(file, "utf8");
  return {
    contractVersion: numberConst(source, "MKT_BROWSER_CONTRACT_VERSION"),
    mcpServerName: stringConst(source, "MKT_BROWSER_MCP_SERVER_NAME"),
    mcpPort: numberConst(source, "MKT_BROWSER_DEFAULT_MCP_PORT"),
    errorCodes: stringArrayConst(source, "MKT_BROWSER_ERROR_CODES"),
    capabilities: stringArrayConst(source, "MKT_BROWSER_CAPABILITIES"),
  };
}

const desktopContractFile = resolveDesktopContractFile();

describe("MKTTool agrees with the snapshot of the desktop contract", () => {
  it("carries exactly the codes the snapshot declares", () => {
    // So theo tập hợp đã sắp xếp: thứ tự khai báo không thuộc giao kèo, thành viên thì có.
    expect([...MKT_BROWSER_ERROR_CODES].sort()).toEqual([...snapshot.errorCodes].sort());
  });

  it("supports the contract version the desktop speaks", () => {
    expect(
      MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS as readonly number[],
      `Browser nói contract ${snapshot.contractVersion}; danh sách hỗ trợ của MKTTool chưa có số đó.`,
    ).toContain(snapshot.contractVersion);
  });

  it("only requires capabilities the desktop can actually report", () => {
    const required = [
      ...REQUIRED_SETUP_BROWSER_CAPABILITIES,
      ...REQUIRED_MANAGED_BROWSER_CAPABILITIES,
    ];

    // Đòi một capability không tồn tại thì mọi máy đều trượt, và trượt theo kiểu không ai sửa được:
    // người dùng được bảo "cập nhật MKT Browser" cho một bản không bao giờ có thứ đó.
    expect(snapshot.capabilities).toEqual(expect.arrayContaining([...new Set(required)]));
  });

  it("agrees on the MCP port and the provider name", () => {
    expect(MKT_BROWSER_DEFAULT_MCP_PORT).toBe(snapshot.mcpPort);
    expect(MKT_BROWSER_PROVIDER_SLUG).toBe(snapshot.mcpServerName);
  });

  it("keeps its own copy internally consistent", () => {
    expect(new Set(MKT_BROWSER_ERROR_CODES).size).toBe(MKT_BROWSER_ERROR_CODES.length);
    expect(MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS.length).toBeGreaterThan(0);
    expect(REQUIRED_SETUP_BROWSER_CAPABILITIES).toEqual(
      expect.arrayContaining([...REQUIRED_MANAGED_BROWSER_CAPABILITIES]),
    );
  });
});

describe("the snapshot still matches the MKTBrowser checkout", () => {
  it("reports whether the desktop contract was available to compare", () => {
    // Phép kiểm luôn chạy này là chỗ ghi lại việc chặng hai có chạy hay không. Nó không đòi phải
    // có repo anh em — máy CI không có — nhưng nó đòi đường dẫn phải là một trong hai trạng thái
    // đọc được, chứ không phải một chuỗi rỗng hay một thư mục nửa vời.
    expect(desktopContractFile === null || existsSync(desktopContractFile)).toBe(true);
  });

  it.runIf(desktopContractFile)("matches the desktop source file", () => {
    const desktop = readDesktopContract(desktopContractFile as string);

    if (process.env.UPDATE_DESKTOP_CONTRACT_SNAPSHOT === "1") {
      writeFileSync(SNAPSHOT_FILE, `${JSON.stringify({ ...snapshot, ...desktop }, null, 2)}\n`, "utf8");

      // Dừng tại đây, và dừng bằng một lượt ĐỎ. Lượt vừa ghi đè bản chụp không còn tư cách phán
      // xử chính nó, và một lượt xanh ở đây sẽ bị đọc thành "hai bên đã khớp" trong khi việc thật
      // — chép mã mới sang danh sách của MKTTool — còn chưa ai làm.
      throw new Error(
        "Đã làm mới desktop-contract-snapshot.json. Chạy lại phép kiểm để xem MKTTool còn thiếu gì.",
      );
    }

    const refresh = snapshot._refresh;
    expect([...desktop.errorCodes].sort(), `Bản chụp đã cũ. Làm mới: ${refresh}`).toEqual(
      [...snapshot.errorCodes].sort(),
    );
    expect([...desktop.capabilities].sort(), `Bản chụp đã cũ. Làm mới: ${refresh}`).toEqual(
      [...snapshot.capabilities].sort(),
    );
    expect(desktop.contractVersion, `Bản chụp đã cũ. Làm mới: ${refresh}`).toBe(
      snapshot.contractVersion,
    );
    expect(desktop.mcpPort, `Bản chụp đã cũ. Làm mới: ${refresh}`).toBe(snapshot.mcpPort);
    expect(desktop.mcpServerName, `Bản chụp đã cũ. Làm mới: ${refresh}`).toBe(snapshot.mcpServerName);
  });
});
