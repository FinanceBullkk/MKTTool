/**
 * Prove the installed-root cleanup stops the Relay companion this run caused - and only that one.
 *
 * Starts the installed browser the way the gate does, waits for the app to bring its companion up,
 * then runs the same two cleanup calls. Creates no profile, so it can be repeated freely.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { buildInstalledRootEnvironment } from "./mkt-browser-cft-smoke-runtime";
import {
  listRelayCompanionPids, stopRelayCompanionsStartedSince,
} from "./mkt-browser-cft-smoke-firewall";

async function main(): Promise<void> {
  const browserExe = path.join(
    process.env.LOCALAPPDATA ?? "", "Programs", "MKTBrowser", "MKTBrowser.exe",
  );
  const before = await listRelayCompanionPids();
  console.log(`Relay companions before: ${before.length ? before.join(",") : "none"}`);

  const child = spawn(browserExe, [], {
    env: buildInstalledRootEnvironment(47899), stdio: "ignore", windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", () => reject(new Error("Could not spawn the installed MKT Browser.")));
  });

  let started: number[] = [];
  for (let attempt = 0; attempt < 30 && !started.length; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    started = (await listRelayCompanionPids()).filter((pid) => !before.includes(pid));
  }
  if (!started.length) throw new Error("The app never started a Relay companion; nothing to prove.");
  console.log(`Relay companion started by this run: ${started.join(",")}`);

  if (child.exitCode === null && !child.killed) {
    child.kill();
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 10_000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
    });
  }
  const stopped = await stopRelayCompanionsStartedSince(before);
  const remaining = await listRelayCompanionPids();
  console.log(`Stopped: ${stopped.join(",") || "none"}. Remaining: ${remaining.join(",") || "none"}`);

  if (stopped.sort().join() !== started.sort().join()) throw new Error("Cleanup stopped the wrong set.");
  if (remaining.some((pid) => started.includes(pid))) throw new Error("A companion this run started is still alive.");
  if (before.some((pid) => !remaining.includes(pid))) throw new Error("Cleanup killed a pre-existing companion.");
  console.log("PASS: cleanup stopped exactly the companion this run caused.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown failure.");
  process.exitCode = 1;
});
