import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  acquireWindowsNamedMutex,
  WindowsNamedMutexBusyError,
  type WindowsNamedMutex,
} from "./windows-named-mutex";

describe.skipIf(process.platform !== "win32")("Windows named mutex", () => {
  it("keeps a second helper out until the owner releases the kernel mutex", async () => {
    const name = `MKTToolRelayTlsFixtureTest-${randomUUID()}`;
    let first: WindowsNamedMutex | undefined;
    let second: WindowsNamedMutex | undefined;

    try {
      first = await acquireWindowsNamedMutex(name);
      await expect(acquireWindowsNamedMutex(name)).rejects.toBeInstanceOf(WindowsNamedMutexBusyError);

      await first.release();
      first = undefined;

      second = await acquireWindowsNamedMutex(name);
    } finally {
      await second?.release();
      await first?.release();
    }
  });
});
