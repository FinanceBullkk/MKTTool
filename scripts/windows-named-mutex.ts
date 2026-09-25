import { type ChildProcess, spawn } from "node:child_process";

const READY_TIMEOUT_MS = 5_000;
const RELEASE_TIMEOUT_MS = 5_000;

export interface WindowsNamedMutex {
  release(): Promise<void>;
}

export class WindowsNamedMutexBusyError extends Error {
  constructor() {
    super("Another process owns the requested Windows mutex.");
    this.name = "WindowsNamedMutexBusyError";
  }
}

/**
 * Holds a current-user Global Windows kernel mutex across Terminal Services sessions.
 * The helper process exits with its parent, so an unexpected parent exit releases the mutex.
 */
export async function acquireWindowsNamedMutex(name: string): Promise<WindowsNamedMutex> {
  if (process.platform !== "win32") {
    throw new Error("Windows named mutexes are available only on Windows.");
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error("Windows mutex names may contain only letters, digits, periods, underscores, and hyphens.");
  }

  const child = spawn(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
      Buffer.from(mutexHolderScript(name), "utf16le").toString("base64"),
    ],
    { stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );

  let signal: "READY" | "BUSY";
  try {
    signal = await waitForMutexSignal(child);
  } catch {
    await stopMutexHolder(child);
    throw new Error("The Relay TLS fixture could not start its certificate-store lock.");
  }

  if (signal === "BUSY") {
    await waitForExit(child, RELEASE_TIMEOUT_MS).catch(() => undefined);
    throw new WindowsNamedMutexBusyError();
  }

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        if (!child.stdin.destroyed) child.stdin.write("release\n");
        await waitForExit(child, RELEASE_TIMEOUT_MS);
      } catch {
        await stopMutexHolder(child);
        throw new Error("The Relay TLS fixture certificate-store lock did not release.");
      }
    },
  };
}

function mutexHolderScript(name: string): string {
  return `
$ErrorActionPreference = 'Stop'
$logicalName = ${powerShellLiteral(name)}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$mutex = $null
$owned = $false
try {
  if ($null -eq $identity.User) { throw 'The current Windows user has no SID.' }
  $mutexName = 'Global\\' + $logicalName + '-' + $identity.User.Value
  $mutex = [System.Threading.Mutex]::new($false, $mutexName)
  try {
    $owned = $mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $owned = $true
  }
  if (-not $owned) {
    [Console]::Out.WriteLine('BUSY')
    exit 73
  }
  [Console]::Out.WriteLine('READY')
  while ($true) {
    $command = [Console]::In.ReadLine()
    if ($null -eq $command -or $command -eq 'release') { break }
  }
} finally {
  if ($owned -and $null -ne $mutex) { $mutex.ReleaseMutex() }
  if ($null -ne $mutex) { $mutex.Dispose() }
  if ($null -ne $identity) { $identity.Dispose() }
}
`;
}

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function waitForMutexSignal(child: ChildProcess): Promise<"READY" | "BUSY"> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => finish(() => reject(new Error("Timed out."))), READY_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const signal = stdout.split(/\r?\n/, 1)[0]?.trim();
      if (signal === "READY" || signal === "BUSY") finish(() => resolve(signal));
    });
    child.once("error", () => finish(() => reject(new Error("Could not start PowerShell."))));
    child.once("exit", () => finish(() => reject(new Error("Mutex holder exited before signalling."))));
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.removeListener("exit", onExit);
      reject(new Error("Timed out."));
    }, timeoutMs);
    const onExit = (): void => {
      clearTimeout(timeout);
      resolve();
    };
    child.once("exit", onExit);
  });
}

async function stopMutexHolder(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    child.kill();
  } catch {
    return;
  }
  await waitForExit(child, RELEASE_TIMEOUT_MS).catch(() => undefined);
}
