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
import { execFileSync, type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RELAY_ORIGIN } from "../src/lib/relay/relay-endpoints";
import { relayChildEnvironment } from "../relay/src/relay-child-environment";

/** Legacy path exported for scripts that only print a diagnostic. It is never used as a fallback. */
export const EXECUTABLE_FILE = path.join(process.cwd(), "relay", "dist", "MKTTool-Relay.exe");

export interface PreparedRelayCandidate {
  archivePath: string;
  metadataPath: string;
  executablePath: string;
  stagingDir: string;
  version: number;
  archiveSizeBytes: number;
  archiveSha256: string;
  executableSizeBytes: number;
  executableSha256: string;
}

function sha256(filePath: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

/**
 * Extract and bind an explicitly supplied archive to the executable that will be launched.
 * Missing or stale sidecar data is an error; this function never falls back to relay/dist.
 */
export function prepareRelayCandidate(
  archiveInput: string,
  metadataInput?: string,
): PreparedRelayCandidate {
  const archivePath = path.resolve(archiveInput);
  if (!existsSync(archivePath) || !statSync(archivePath).isFile()) {
    throw new Error(`Relay candidate archive does not exist: ${archivePath}`);
  }
  const metadataPath = path.resolve(
    metadataInput || path.join(path.dirname(archivePath), "MKTTool-Relay.metadata.json"),
  );
  if (!existsSync(metadataPath) || !statSync(metadataPath).isFile()) {
    throw new Error(`Relay candidate sidecar does not exist: ${metadataPath}`);
  }

  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Relay candidate sidecar is invalid JSON: ${(error as Error).message}`);
  }
  const version = metadata.version;
  const archiveSizeBytes = statSync(archivePath).size;
  const archiveSha256 = sha256(archivePath);
  if (!Number.isSafeInteger(version) || Number(version) <= 0) {
    throw new Error("Relay candidate sidecar has no valid version.");
  }
  if (metadata.sizeBytes !== archiveSizeBytes || metadata.sha256 !== archiveSha256) {
    throw new Error("Relay candidate archive does not match its sidecar size/SHA-256.");
  }
  if (
    !Number.isSafeInteger(metadata.executableSizeBytes) ||
    typeof metadata.executableSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(metadata.executableSha256)
  ) {
    throw new Error("Relay candidate sidecar must bind executableSizeBytes and executableSha256.");
  }

  const stagingDir = mkdtempSync(path.join(tmpdir(), "mkttool-relay-candidate-"));
  try {
    // Windows ships bsdtar, and passing paths as argv avoids PowerShell's surprising `-Command`
    // argument binding (which otherwise dropped paths containing spaces).  The archive is a
    // normal ZIP, so the same command is also available on the Unix build host.
    execFileSync("tar.exe", ["-xf", archivePath, "-C", stagingDir], { stdio: "pipe" });
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw new Error(`Relay candidate archive extraction failed: ${(error as Error).message}`);
  }

  const executablePath = path.join(stagingDir, "MKTTool-Relay.exe");
  if (!existsSync(executablePath) || !statSync(executablePath).isFile()) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw new Error("Relay candidate archive does not contain MKTTool-Relay.exe at its root.");
  }
  const executableSizeBytes = statSync(executablePath).size;
  const executableSha256 = sha256(executablePath);
  if (
    executableSizeBytes !== Number(metadata.executableSizeBytes) ||
    executableSha256 !== metadata.executableSha256
  ) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw new Error("Extracted Relay executable does not match its sidecar size/SHA-256.");
  }

  return {
    archivePath,
    metadataPath,
    executablePath,
    stagingDir,
    version: Number(version),
    archiveSizeBytes,
    archiveSha256,
    executableSizeBytes,
    executableSha256,
  };
}

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
  /** Abrupt termination used only by the crash-recovery leg of the evidence harness. */
  forceStop(): void;
  waitForExit(timeoutMs?: number): Promise<number | null>;
}

export function isRelayInitializationComplete(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const health = value as Record<string, unknown>;
  return (
    health.startupState === undefined &&
    typeof health.publicKey === "string" &&
    /^[0-9a-f]{64}$/i.test(health.publicKey) &&
    Number.isSafeInteger(health.relayVersion) &&
    Number(health.relayVersion) > 0
  );
}

function isFailedRelayStartup(value: unknown): boolean {
  return !!value && typeof value === "object" &&
    (value as Record<string, unknown>).startupState === "failed";
}

function stopRelayProcess(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.killed) return;
  if (process.platform === "win32" && child.pid) {
    try {
      // The bootstrap process supervises a protected-state child, so terminate this known test
      // process tree rather than leaving the operational child on the fixed Relay port.
      execFileSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      return;
    } catch {
      // Fall through to Node's best-effort signal when taskkill cannot find an already-exited PID.
    }
  }
  child.kill(signal);
}

export interface RelayExecutableLaunchOptions {
  /** A disposable CA is allowed only for an explicitly launched integration-fixture child. */
  fixtureExtraCaCertPath?: string;
  /** Lets fixtures prove that inherited Node trust overrides cannot leak into the child. */
  inheritedEnvironment?: Record<string, string | undefined>;
}

export function relayExecutableEnvironment(
  overrides: Record<string, string | undefined> = {},
  options: RelayExecutableLaunchOptions = {},
): NodeJS.ProcessEnv {
  const environment = relayChildEnvironment(
    overrides,
    options.inheritedEnvironment ?? process.env,
  );
  if (options.fixtureExtraCaCertPath) {
    environment.NODE_EXTRA_CA_CERTS = options.fixtureExtraCaCertPath;
  }
  return environment;
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

export async function startRelay(
  home: string,
  executablePath: string,
  options: RelayExecutableLaunchOptions = {},
): Promise<RunningRelay> {
  const resolvedExecutablePath = path.resolve(executablePath);
  if (!existsSync(resolvedExecutablePath)) {
    throw new Error(`Relay executable does not exist: ${resolvedExecutablePath}`);
  }
  if (await portAlreadyTaken()) {
    throw new Error(
      `Đã có một cầu nối khác đang nghe ở ${RELAY_ORIGIN}. Bài nghiệm thu sẽ đo nhầm chiếc đó ` +
        `chứ không phải bản vừa build.\n\nTắt nó rồi chạy lại — thường là bản đã cài chạy nền:\n` +
        `  Get-Process MKTTool-Relay | Stop-Process`,
    );
  }

  const child: ChildProcess = spawn(resolvedExecutablePath, [], {
    env: relayExecutableEnvironment({ RELAY_HOME: home }, options),
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
      stopRelayProcess(child, "SIGTERM");
    },
    forceStop: () => {
      stopRelayProcess(child, "SIGKILL");
    },
    waitForExit: (timeoutMs = 10_000) =>
      new Promise((resolve) => {
        if (exited !== null) {
          resolve(exited);
          return;
        }
        const timer = setTimeout(() => resolve(exited), timeoutMs);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve(exited);
        });
      }),
  };

  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited !== null) {
      throw new Error(`Cầu nối tắt ngay khi vừa bật (mã ${exited}):\n${log}`);
    }

    let health: unknown;
    try {
      const response = await fetch(`${RELAY_ORIGIN}/health`);
      health = await response.json() as unknown;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      continue;
    }
    if (isRelayInitializationComplete(health)) return running;
    if (isFailedRelayStartup(health)) {
      running.stop();
      throw new Error("Relay reported a failed startup.");
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
