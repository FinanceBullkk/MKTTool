/**
 * Nhánh quá giờ của `pg_dump`.
 *
 * Vì sao nhánh này đáng một bài test riêng: nó không hỏng ồn ào. `runPgDump` chỉ kết thúc khi tiến
 * trình con đóng, nên một `pg_dump` treo làm Promise không bao giờ giải quyết — lượt sao lưu đêm
 * im lặng tuyệt đối, không log, không ghi gì vào `ScheduledJobRun`, và nhìn từ ngoài giống hệt
 * "chưa tới giờ hẹn". Cùng loại nguy hiểm với dump rỗng, thứ module này đã cố ý coi là thất bại.
 *
 * `spawn` được thay bằng bản giả để không phụ thuộc vào việc máy chạy test có `pg_dump` hay có
 * Postgres. Thứ đang kiểm là hành vi hẹn giờ, không phải bản thân `pg_dump`.
 */
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// Phải thay trước khi module dưới test nạp `node:child_process`.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

import type { BackupSource } from "./backup-source";
import { dumpDatabaseTo } from "./database-backup";

const SOURCE: BackupSource = {
  kind: "local",
  databaseUrl: "postgresql://postgres:password@localhost:5432/mkttool_test",
  namePrefix: "mkttool",
};

/** Trần nhỏ để bài test không phải chờ thật. Đường thật dùng 10 phút. */
const TIMEOUT_MS = 20;

interface FakeChild extends EventEmitter {
  stderr: EventEmitter;
  kill: ReturnType<typeof vi.fn>;
}

/** Tiến trình giả: không bao giờ tự đóng trừ khi bài test bảo nó đóng. */
function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

function scratchPath(name: string): string {
  return path.join(tmpdir(), `mkttool-test-${Date.now()}-${name}.sql`);
}

describe("dumpDatabaseTo timeout", () => {
  it("fails clearly when pg_dump hangs instead of hanging forever", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    // Tiến trình giả không bao giờ phát `close`. Không có trần thì `await` này đứng mãi.
    await expect(dumpDatabaseTo(scratchPath("hanging"), SOURCE, TIMEOUT_MS)).rejects.toThrow(
      /did not finish within/,
    );

    // SIGTERM trước, để `pg_dump` thật có cơ hội hủy truy vấn đang mở thay vì bị chặt ngang.
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });

  it("cancels the timeout after a normal close so no late SIGTERM occurs", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const done = dumpDatabaseTo(scratchPath("normal"), SOURCE, TIMEOUT_MS);
    child.emit("close", 0);
    await expect(done).resolves.toBeUndefined();

    // Chờ quá trần rồi mới kiểm: nếu `settle` không `clearTimeout`, cái hẹn vẫn bắn và gửi tín
    // hiệu tới một tiến trình đã kết thúc từ lâu.
    await new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS * 4));
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("includes Postgres stderr when the exit code is nonzero", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const done = dumpDatabaseTo(scratchPath("error-code"), SOURCE, TIMEOUT_MS);
    child.stderr.emit("data", Buffer.from('pg_dump: error: connection to server failed\n'));
    child.emit("close", 1);

    await expect(done).rejects.toThrow(/connection to server failed/);
  });
});

describe("dumpDatabaseTo with pg_dump older than the server", () => {
  /**
   * Ca đã xảy ra thật 08/08/2026: Railway lên Postgres 18, máy dev còn client 17, và
   * `npm run db:backup:remote` gãy — đúng bước phải chạy TRƯỚC mỗi lần deploy đổi cấu trúc
   * database. Nguyên văn của Postgres nêu hai con số rồi thôi, không nói phải làm gì.
   */
  const LOI_LECH_BAN =
    "pg_dump: error: aborting because of server version mismatch\n" +
    "pg_dump: detail: server version: 18.4 (Debian 18.4-1.pgdg13+1); pg_dump version: 17.10";

  it("preserves the Postgres message and adds remediation", async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const done = dumpDatabaseTo(scratchPath("version-mismatch"), SOURCE, TIMEOUT_MS);
    child.stderr.emit("data", Buffer.from(LOI_LECH_BAN));
    child.emit("close", 1);

    const error = await done.catch((e: Error) => e);
    const message = (error as Error).message;

    // Hai con số vẫn phải còn: người đọc cần biết chính xác server nào và client nào.
    expect(message).toContain("server version: 18.4");
    expect(message).toContain("pg_dump version: 17.10");
    // ...và câu chỉ đường, thứ nguyên văn của Postgres không có.
    expect(message).toContain("PG_DUMP_PATH");
    expect(message).toMatch(/major version is at least the server major/);
  });

  it("does NOT add version remediation to an unrelated failure", async () => {
    // Gợi ý sai chỗ đắt hơn không gợi ý: nó cử người đi cài Postgres mới trong khi thứ hỏng là
    // đường mạng tới database.
    const child = fakeChild();
    spawnMock.mockReturnValue(child);

    const done = dumpDatabaseTo(scratchPath("ordinary-error"), SOURCE, TIMEOUT_MS);
    child.stderr.emit("data", Buffer.from("pg_dump: error: connection to server failed"));
    child.emit("close", 1);

    const message = ((await done.catch((e: Error) => e)) as Error).message;
    expect(message).not.toContain("PG_DUMP_PATH");
    expect(message).toContain("code 1");
  });
});
