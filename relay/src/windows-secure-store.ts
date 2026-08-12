import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RelaySecretName, SecureStore } from "./secure-store";

const STORE_DIRECTORY = "protected-secrets";
const POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  : "powershell.exe";

/**
 * Cả hai chiều đi qua base64, kể cả phía chữ thường.
 *
 * Windows PowerShell 5.1 giải mã stdin và mã hoá stdout theo **bảng mã console** (OEM), không phải
 * UTF-8, khi hai đầu đó bị chuyển hướng. Hai khoá hiện tại đều là hex nên ASCII và không sao — cho
 * tới ngày ai đó cất một bí mật có ký tự ngoài ASCII, lúc đó nó hỏng **âm thầm**: ghi vào một
 * đằng, đọc ra một nẻo, và triệu chứng sẽ là "khóa sai" chứ không phải "mã hoá sai".
 *
 * Ép `[Console]::InputEncoding` không phải đường ra: đặt nó khi stdin đã bị chuyển hướng thì ném
 * "The handle is invalid" trên chính bản PowerShell này. Cho base64 chạy cả hai chiều thì mọi byte
 * qua đường ống đều nằm trong ASCII, và bảng mã của máy không còn là biến số nữa.
 *
 * Định dạng trên đĩa **không đổi** — vẫn là base64 của ciphertext DPAPI — nên blob đã ghi trước
 * thay đổi này vẫn đọc ra bình thường.
 */
const PROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$encoded = [Console]::In.ReadToEnd()",
  "$bytes = [Convert]::FromBase64String($encoded)",
  "$cipher = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($cipher))",
].join("; ");

const UNPROTECT_SCRIPT = [
  "Add-Type -AssemblyName System.Security",
  "$encoded = [Console]::In.ReadToEnd()",
  "$cipher = [Convert]::FromBase64String($encoded)",
  "$plain = [Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($plain))",
].join("; ");

/** Chữ thường → base64 để gửi qua đường ống, và ngược lại. */
function toTransport(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function fromTransport(encoded: string): string {
  return Buffer.from(encoded, "base64").toString("utf8");
}

/**
 * DPAPI CurrentUser protects secrets from offline/plaintext disclosure for this Windows user. It is
 * a same-user boundary, not process isolation or a sandbox; another process as this user can ask
 * Windows to decrypt the blobs. Full-disk encryption remains required for browser/session data.
 */
export class WindowsSecureStore implements SecureStore {
  constructor(private readonly home: string) {}

  read(name: RelaySecretName): string | null {
    const filePath = this.filePath(name);
    let protectedValue: string;
    try {
      protectedValue = readFileSync(filePath, "utf8").trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new Error(`Cannot read protected Relay secret ${name}: ${(error as Error).message}`);
    }

    return fromTransport(runDpapi(UNPROTECT_SCRIPT, protectedValue, `decrypt ${name}`));
  }

  write(name: RelaySecretName, value: string): void {
    const directory = path.join(this.home, STORE_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    const destination = this.filePath(name);
    const temporary = `${destination}.${process.pid}.tmp`;
    const protectedValue = runDpapi(PROTECT_SCRIPT, toTransport(value), `protect ${name}`);

    try {
      writeFileSync(temporary, `${protectedValue}\n`, { encoding: "utf8", flag: "wx" });
      renameSync(temporary, destination);
    } catch (error) {
      try {
        unlinkSync(temporary);
      } catch {
        // The temporary file may not have been created. It contains only DPAPI ciphertext.
      }
      throw new Error(`Cannot persist protected Relay secret ${name}: ${(error as Error).message}`);
    }
  }

  writeIfAbsent(name: RelaySecretName, value: string): boolean {
    const directory = path.join(this.home, STORE_DIRECTORY);
    mkdirSync(directory, { recursive: true });
    const protectedValue = runDpapi(PROTECT_SCRIPT, toTransport(value), `protect ${name}`);
    try {
      writeFileSync(this.filePath(name), `${protectedValue}\n`, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw new Error(`Cannot persist protected Relay secret ${name}: ${(error as Error).message}`);
    }
  }

  private filePath(name: RelaySecretName): string {
    return path.join(this.home, STORE_DIRECTORY, `${name}.dpapi`);
  }
}


function runDpapi(script: string, input: string, operation: string): string {
  if (process.platform !== "win32") {
    throw new Error(`Windows DPAPI is unavailable while attempting to ${operation}.`);
  }
  try {
    return execFileSync(POWERSHELL, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script], {
      input,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }).trim();
  } catch (error) {
    throw new Error(`Windows DPAPI could not ${operation}: ${(error as Error).message}`);
  }
}
