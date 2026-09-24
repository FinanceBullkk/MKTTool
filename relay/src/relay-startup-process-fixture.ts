import { existsSync, writeFileSync } from "node:fs";
import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import {
  awaitRelayStartupActivation,
  notifyRelayStartupFailure,
  notifyRelayStartupHandoff,
  notifyRelayStartupListening,
  readRelayStartupChildId,
  startRelayStartupBootstrap,
} from "./relay-startup-bootstrap";

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function fixturePort(): number {
  const value = Number(requiredEnvironment("RELAY_STARTUP_FIXTURE_PORT"));
  if (!Number.isSafeInteger(value) || value <= 0 || value > 65_535) {
    throw new Error("RELAY_STARTUP_FIXTURE_PORT is invalid.");
  }
  return value;
}

function fixtureStartupTimeout(): number | undefined {
  const value = process.env.RELAY_STARTUP_FIXTURE_TIMEOUT_MS;
  if (!value) return undefined;
  const timeout = Number(value);
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("RELAY_STARTUP_FIXTURE_TIMEOUT_MS is invalid.");
  }
  return timeout;
}

function blockLikeDelayedDpapi(): void {
  const released = requiredEnvironment("RELAY_STARTUP_FIXTURE_RELEASE_PATH");
  writeFileSync(requiredEnvironment("RELAY_STARTUP_FIXTURE_BLOCKED_PATH"), "blocked\n", "utf8");
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  while (!existsSync(released)) Atomics.wait(sleeper, 0, 0, 10);
}

function waitForFileSignal(path: string): void {
  const sleeper = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
  while (!existsSync(path)) Atomics.wait(sleeper, 0, 0, 10);
}

async function run(): Promise<void> {
  const startupId = readRelayStartupChildId();
  if (!startupId) {
    await startRelayStartupBootstrap({
      home: requiredEnvironment("RELAY_HOME"),
      port: fixturePort(),
      allowedOrigin: () => null,
      startupTimeoutMs: fixtureStartupTimeout(),
    });
    return;
  }

  // This fixture uses the same event-loop-blocking shape as execFileSync DPAPI before signaling ready.
  writeFileSync(requiredEnvironment("RELAY_STARTUP_FIXTURE_CHILD_PID_PATH"), `${process.pid}\n`, "utf8");
  blockLikeDelayedDpapi();
  if (process.env.RELAY_STARTUP_FIXTURE_MODE === "handoff") {
    await notifyRelayStartupHandoff(startupId);
    return;
  }
  if (process.env.RELAY_STARTUP_FIXTURE_MODE === "fail-late") {
    await notifyRelayStartupFailure(startupId);
    await notifyRelayStartupListening(startupId);
    return;
  }

  await awaitRelayStartupActivation(startupId, "runtime");
  if (process.env.RELAY_STARTUP_FIXTURE_MODE === "port-conflict") {
    writeFileSync(requiredEnvironment("RELAY_STARTUP_FIXTURE_ACTIVATION_PATH"), "activated\n", "utf8");
    waitForFileSignal(requiredEnvironment("RELAY_STARTUP_FIXTURE_CONTINUE_PATH"));
  }
  if (process.env.RELAY_STARTUP_FIXTURE_MODE === "fail-after-activation") {
    await notifyRelayStartupFailure(startupId);
    await notifyRelayStartupListening(startupId);
    return;
  }
  const server = createRelayServer({
    allowedOrigin: () => null,
    htmlPages: {},
    routes: {
      [RELAY_PATHS.health]: {
        method: "GET",
        capability: "fixture-health",
        handler: () => ({ ok: true, message: "Relay is ready.", configured: true }),
      },
    },
  });
  await listenOnLoopback(server, fixturePort());
  writeFileSync(requiredEnvironment("RELAY_STARTUP_FIXTURE_READY_PID_PATH"), `${process.pid}\n`, "utf8");
  await notifyRelayStartupListening(startupId);
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return;
    stopping = true;
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("disconnect", shutdown);
}

void run().catch(async () => {
  const startupId = readRelayStartupChildId();
  if (startupId) {
    try {
      await notifyRelayStartupFailure(startupId);
    } catch {
      // The parent may already have exited after a deliberate compatibility handoff.
    }
  }
  process.exitCode = 1;
});
