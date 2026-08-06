/**
 * Bật/tắt file `.exe` cầu nối và nói chuyện HTTP với nó. Phần khung của
 * `smoke-test-relay-executable.ts`.
 *
 * Tách khỏi phần kiểm để bài nghiệm thu đọc được như một câu chuyện: mỗi dòng ở đó là một điều
 * đang được chứng minh, không lẫn với việc chờ cổng mở hay dựng thân request.
 *
 * ## Nhà của cầu nối nằm ở thư mục tạm của hệ điều hành
 *
 * Không đặt trong repo. Chạy một lượt là sinh ra **khóa riêng của máy** và một file cấu hình
 * mang **khóa vùng operator** — đúng hai thứ mà cả GĐ3/GĐ4 dựng ra để bảo vệ. Để chúng trong
 * cây làm việc là đặt cược vào một dòng `.gitignore`; để ở thư mục tạm thì không có cược nào.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RELAY_ORIGIN } from "../src/lib/relay/relay-endpoints";

export const EXECUTABLE_FILE = path.join(process.cwd(), "relay", "dist", "MKTTool-Relay.exe");

/** Chờ cổng mở bao lâu. Lần chạy đầu của một `.exe` SEA còn phải giải nén nên chậm hơn hẳn. */
const STARTUP_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;

/** Thư mục dữ liệu dùng một lần. Người gọi xóa bằng `rmSync(home, ...)` khi xong. */
export function makeTempHome(): string {
  return mkdtempSync(path.join(tmpdir(), "mkttool-relay-smoke-"));
}

export interface RunningRelay {
  /** Mọi thứ cầu nối in ra, gộp cả stdout lẫn stderr — in ra khi một phép kiểm đỏ. */
  output(): string;
  stop(): void;
}

/**
 * Bật `.exe` với `RELAY_HOME` chỉ định và chờ tới lúc nó trả lời được.
 *
 * Cầu nối **chỉ đọc file cấu hình lúc khởi động**, nên bài nghiệm thu phải tắt/bật lại giữa
 * chừng — đó là lý do hàm này trả về `stop()` thay vì tự dọn.
 */
/**
 * Cổng đã có người nghe chưa.
 *
 * Phải hỏi **trước khi** spawn, vì vòng chờ bên dưới chỉ biết "có ai trả lời ở cổng đó không" —
 * nó không phân biệt được `.exe` mình vừa bật với một cầu nối khác đã chạy sẵn trên máy. Bản đầu
 * của hàm này không hỏi, và hậu quả đo được 06/08/2026: máy đang chạy bản cài thật từ
 * `Downloads`, nên cả bài nghiệm thu đo nhầm chiếc đó — 9 phép đỏ với những câu chẳng liên quan
 * gì tới thứ vừa build ("bản 1", "chưa cấu hình xong"), và mất một lúc mới lần ra.
 */
async function portAlreadyTaken(): Promise<boolean> {
  // Chờ một nhịp ngắn trước khi kết luận: bài nghiệm thu có tắt/bật lại giữa chừng, và chiếc vừa
  // bị `kill` nhả cổng sau vài chục mili giây. Chiếc lạ thì không nhả — nên hạn chờ này phân biệt
  // được hai ca mà không cần biết PID của ai.
  const deadline = Date.now() + 3_000;

  while (Date.now() < deadline) {
    try {
      await fetch(`${RELAY_ORIGIN}/health`, { signal: AbortSignal.timeout(2_000) });
    } catch {
      return false;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return true;
}

export async function startRelay(home: string): Promise<RunningRelay> {
  if (await portAlreadyTaken()) {
    throw new Error(
      `Đã có một cầu nối khác đang nghe ở ${RELAY_ORIGIN}. Bài nghiệm thu sẽ đo nhầm chiếc đó ` +
        `chứ không phải bản vừa build.\n\nTắt nó rồi chạy lại — thường là bản đã cài chạy nền:\n` +
        `  Get-Process MKTTool-Relay | Stop-Process`,
    );
  }

  const child: ChildProcess = spawn(EXECUTABLE_FILE, [], {
    env: { ...process.env, RELAY_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout?.on("data", (chunk: Buffer) => (log += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (log += chunk.toString()));

  let exited: number | null = null;
  child.on("exit", (code) => (exited = code ?? 0));

  const running: RunningRelay = {
    output: () => log,
    stop: () => {
      child.kill();
    },
  };

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`Cầu nối tắt ngay khi vừa bật (mã ${exited}):\n${log}`);
    }

    try {
      await fetch(`${RELAY_ORIGIN}/health`);
      return running;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  running.stop();
  throw new Error(`Cầu nối không mở cổng sau ${STARTUP_TIMEOUT_MS / 1000}s:\n${log}`);
}

/**
 * Một lượt gọi xuống cầu nối, trả về JSON đã parse.
 *
 * `origin` khai được vì hai đường mới (`/configure`, `/set-operator-key`) **tự đối chiếu header
 * đó trong thân hàm** thay vì tin vào CORS — và cách duy nhất để chứng minh phép đối chiếu ấy
 * hoạt động là gửi thử một nguồn sai. Trình duyệt không cho đặt `Origin`; Node thì cho, nên đây
 * cũng chính là cảnh mà kẻ tấn công dùng `curl` sẽ dựng ra.
 */
export async function relayCall(
  path: string,
  body?: unknown,
  options: { origin?: string } = {},
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (options.origin) headers.origin = options.origin;

  const response = await fetch(`${RELAY_ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return (await response.json()) as Record<string, unknown>;
}

/** Dọn thư mục tạm. Nuốt lỗi: một file khóa còn bị Windows giữ không đáng làm đỏ cả bài kiểm. */
export function removeTempHome(home: string): void {
  try {
    rmSync(home, { recursive: true, force: true });
  } catch {
    console.warn(`(không xóa được thư mục tạm ${home} — xóa tay khi rảnh)`);
  }
}
