import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import {
  BUILT_IN_WEB_ORIGIN,
  RELAY_PATHS,
  type RelayStartupState,
} from "../../src/lib/relay/relay-endpoints";
import { relayChildEnvironment } from "./relay-child-environment";
import { createRelayStartupHealth } from "./relay-health-route";
import { createRelayServer, listenOnLoopback, type RelayResponseBody } from "./relay-http-server";
import { defineRelayRoutes } from "./relay-route-policy";
import { SECRET_REVEAL_PATH } from "./secret-page";

export const RELAY_STARTUP_CHILD_SWITCH = "mkt-relay-startup-child";
export const RELAY_STARTUP_TIMEOUT_MS = 30_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RelayStartupMode = "runtime" | "retirement";
type RelayStartupChildMessage =
  | { type: "ready"; startupId: string; mode: RelayStartupMode }
  | { type: "listening"; startupId: string }
  | { type: "handoff"; startupId: string }
  | { type: "failed"; startupId: string };

type RelayStartupParentMessage = { type: "activate"; startupId: string };

export interface RelayStartupBootstrapOptions {
  home: string;
  port?: number;
  executablePath?: string;
  argv?: string[];
  execArgv?: string[];
  allowedOrigin?: () => string | null;
  /** Test-only override for the bounded protected-state initialization window. */
  startupTimeoutMs?: number;
}

export function readRelayStartupChildId(argv: string[] = process.argv): string | null {
  const prefix = `--${RELAY_STARTUP_CHILD_SWITCH}=`;
  const values = argv.filter((argument) => argument.startsWith(prefix)).map((argument) => argument.slice(prefix.length));
  if (values.length === 0) return null;
  if (values.length !== 1 || !UUID.test(values[0]!)) {
    throw new Error("Relay startup child invocation is invalid.");
  }
  return values[0]!;
}

export function createRelayStartupServer(options: {
  startupState: () => RelayStartupState;
  allowedOrigin?: () => string | null;
}): Server {
  const blocked = (): RelayResponseBody => {
    const health = createRelayStartupHealth(options.startupState());
    return {
      ok: false,
      code: health.code,
      startupState: health.startupState,
      message: health.message,
    };
  };

  return createRelayServer({
    // The baked origin lets the normal web page show a truthful pending state before protected
    // config is available. A configured override takes effect only with the operational listener.
    allowedOrigin: options.allowedOrigin ?? (() => BUILT_IN_WEB_ORIGIN),
    htmlPages: {
      "/": () =>
        "<!doctype html><meta charset=utf-8><title>MKTTool Relay</title>" +
        "<h1>MKTTool Relay is starting</h1><p>Keep Relay open, then return to MKTTool and check again.</p>",
    },
    routes: defineRelayRoutes({
      [RELAY_PATHS.health]: () => createRelayStartupHealth(options.startupState()),
      [RELAY_PATHS.configure]: blocked,
      [RELAY_PATHS.setOperatorKey]: blocked,
      [RELAY_PATHS.authorizeBootstrap]: blocked,
      [RELAY_PATHS.bootstrapCompletion]: blocked,
      [RELAY_PATHS.ticket]: blocked,
      [RELAY_PATHS.profiles]: blocked,
      [RELAY_PATHS.licenseCapacityRefresh]: blocked,
      [SECRET_REVEAL_PATH]: blocked,
      [RELAY_PATHS.encryptForVault]: blocked,
      [RELAY_PATHS.sealOperatorKey]: blocked,
      [RELAY_PATHS.receiveOperatorKey]: blocked,
      [RELAY_PATHS.retireDevice]: blocked,
      [RELAY_PATHS.finalizeDeviceRetirement]: blocked,
    }),
  });
}

export async function startRelayStartupBootstrap(options: RelayStartupBootstrapOptions): Promise<void> {
  const startupId = randomUUID();
  const startupTimeoutMs = resolveStartupTimeout(options.startupTimeoutMs);
  let startupState: RelayStartupState = "pending";
  let bootstrapListening = false;
  let terminal = false;
  let activationRequested = false;
  let stopping = false;
  let startupTimeout: NodeJS.Timeout | undefined;
  let work = Promise.resolve();
  const server = createRelayStartupServer({
    startupState: () => startupState,
    allowedOrigin: options.allowedOrigin,
  });
  const port = options.port;
  await listenOnLoopback(server, port);
  bootstrapListening = true;

  const child = spawnRelayStartupChild(options, startupId);
  const clearStartupTimeout = (): void => {
    if (!startupTimeout) return;
    clearTimeout(startupTimeout);
    startupTimeout = undefined;
  };
  const terminateChild = (): void => {
    if (child.exitCode !== null || child.killed) return;
    try {
      child.kill();
    } catch {
      // The child may already have exited between the state check and the signal.
    }
  };
  const disconnectChild = (): void => {
    if (!child.connected) return;
    try {
      child.disconnect();
    } catch {
      // The child can exit immediately after acknowledging the activation handoff.
    }
  };
  const closeBootstrap = async (): Promise<void> => {
    if (!bootstrapListening) return;
    await closeServer(server);
    bootstrapListening = false;
  };
  const restoreFailedBootstrap = async (): Promise<void> => {
    if (bootstrapListening) return;
    await listenOnLoopback(server, port);
    bootstrapListening = true;
  };
  const failStartup = async (): Promise<void> => {
    if (terminal || stopping) return;
    terminal = true;
    startupState = "failed";
    clearStartupTimeout();
    terminateChild();
    try {
      await restoreFailedBootstrap();
    } catch {
      // Another local process claimed the fixed port during handoff. No failure body can be trusted
      // on that port, so leave the Relay unavailable rather than reporting a false ready state.
      process.exitCode = 1;
    }
  };
  const enqueue = (task: () => Promise<void>): void => {
    work = work.then(task, task).catch(() => {
      terminal = true;
      startupState = "failed";
      clearStartupTimeout();
      terminateChild();
      process.exitCode = 1;
    });
  };
  const stopSupervisor = (): void => {
    if (stopping) return;
    stopping = true;
    terminal = true;
    clearStartupTimeout();
    terminateChild();
    void closeBootstrap().catch(() => {
      // Process shutdown must not leave the protected initialization child running.
    });
  };

  child.once("error", () => enqueue(failStartup));
  child.once("exit", () => enqueue(failStartup));
  process.once("SIGTERM", stopSupervisor);
  process.once("SIGINT", stopSupervisor);
  startupTimeout = setTimeout(() => enqueue(failStartup), startupTimeoutMs);
  child.on("message", (message: unknown) => {
    enqueue(async () => {
      const childMessage = parseChildMessage(message, startupId);
      if (!childMessage || terminal || stopping) return;
      if (childMessage.type === "failed") {
        await failStartup();
        return;
      }
      if (childMessage.type === "handoff") {
        terminal = true;
        clearStartupTimeout();
        await closeBootstrap();
        disconnectChild();
        return;
      }
      if (childMessage.type === "ready" && !activationRequested) {
        activationRequested = true;
        await closeBootstrap();
        await sendParentMessage(child, { type: "activate", startupId });
        return;
      }
      if (childMessage.type === "listening" && activationRequested) {
        clearStartupTimeout();
      }
    });
  });
}

export async function awaitRelayStartupActivation(
  startupId: string,
  mode: RelayStartupMode,
): Promise<void> {
  if (!process.connected) throw new Error("Relay startup parent exited before activation.");
  const activation = new Promise<void>((resolve, reject) => {
    const onMessage = (message: unknown): void => {
      if (!isParentMessage(message, startupId)) return;
      cleanup();
      resolve();
    };
    const onDisconnect = (): void => {
      cleanup();
      reject(new Error("Relay startup parent exited before activation."));
    };
    const cleanup = (): void => {
      process.off("message", onMessage);
      process.off("disconnect", onDisconnect);
    };
    process.on("message", onMessage);
    process.once("disconnect", onDisconnect);
  });
  await sendChildMessage({ type: "ready", startupId, mode });
  await activation;
}

export function notifyRelayStartupListening(startupId: string): Promise<void> {
  return sendChildMessage({ type: "listening", startupId });
}

export function notifyRelayStartupHandoff(startupId: string): Promise<void> {
  return sendChildMessage({ type: "handoff", startupId });
}

export function notifyRelayStartupFailure(startupId: string): Promise<void> {
  return sendChildMessage({ type: "failed", startupId });
}

function spawnRelayStartupChild(options: RelayStartupBootstrapOptions, startupId: string): ChildProcess {
  const argv = (options.argv ?? process.argv)
    .slice(1)
    .filter((argument) => !argument.startsWith(`--${RELAY_STARTUP_CHILD_SWITCH}=`));
  return spawn(
    options.executablePath ?? process.execPath,
    [...(options.execArgv ?? process.execArgv), ...argv, `--${RELAY_STARTUP_CHILD_SWITCH}=${startupId}`],
    {
      env: relayChildEnvironment({ RELAY_HOME: options.home }),
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      windowsHide: true,
    },
  );
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close((error) => (error ? reject(error) : resolve()));
    // A stalled loopback request must not prevent the child from claiming the port.
    server.closeAllConnections();
  });
}

function resolveStartupTimeout(value: number | undefined): number {
  const timeout = value ?? RELAY_STARTUP_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeout) || timeout <= 0) {
    throw new Error("Relay startup timeout must be a positive whole number of milliseconds.");
  }
  return timeout;
}

function parseChildMessage(message: unknown, startupId: string): RelayStartupChildMessage | null {
  if (!message || typeof message !== "object") return null;
  const value = message as Partial<RelayStartupChildMessage>;
  if (value.startupId !== startupId) return null;
  if (value.type === "ready" && (value.mode === "runtime" || value.mode === "retirement")) {
    return value as RelayStartupChildMessage;
  }
  if (value.type === "listening" || value.type === "handoff" || value.type === "failed") {
    return value as RelayStartupChildMessage;
  }
  return null;
}

function isParentMessage(message: unknown, startupId: string): message is RelayStartupParentMessage {
  return !!message && typeof message === "object" &&
    (message as RelayStartupParentMessage).type === "activate" &&
    (message as RelayStartupParentMessage).startupId === startupId;
}

function sendParentMessage(child: ChildProcess, message: RelayStartupParentMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!child.connected) {
      reject(new Error("Relay startup child exited before activation."));
      return;
    }
    child.send(message, (error) => (error ? reject(error) : resolve()));
  });
}

function sendChildMessage(message: RelayStartupChildMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof process.send !== "function") {
      reject(new Error("Relay startup child has no parent process."));
      return;
    }
    process.send(message, (error) => (error ? reject(error) : resolve()));
  });
}
