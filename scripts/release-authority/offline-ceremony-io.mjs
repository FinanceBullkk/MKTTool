import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function createNewDirectory(directory) {
  mkdirSync(directory, { recursive: false });
}

export function writeJsonExclusive(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, serializeJson(value), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporary, filePath);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file may not have been created.
    }
    throw error;
  }
}

export function assertSeparateVolumeRoots(left, right) {
  const leftRoot = path.parse(path.resolve(left)).root.toLowerCase();
  const rightRoot = path.parse(path.resolve(right)).root.toLowerCase();
  if (leftRoot === rightRoot) {
    throw new Error("The two encrypted root backups must be written to different volume roots.");
  }
}

export async function readConfirmedPassphrase() {
  const first = await readHiddenLine("Root-backup passphrase: ");
  const second = await readHiddenLine("Confirm passphrase: ");
  if (first !== second) throw new Error("The two passphrases do not match.");
  if (first.length < 20) throw new Error("Use at least 20 characters from the owner's password manager.");
  return first;
}

export async function readRecoveryPassphrase() {
  return readHiddenLine("Root-backup passphrase: ");
}

function readHiddenLine(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("The ceremony requires an interactive terminal so the passphrase stays hidden.");
  }
  return new Promise((resolve, reject) => {
    let value = "";
    const stdin = process.stdin;
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();

    const finish = (error) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (character) => {
      if (character === "\u0003") return finish(new Error("Ceremony cancelled."));
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += character;
    };
    stdin.on("data", onData);
  });
}
