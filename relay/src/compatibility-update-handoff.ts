import {
  coordinateCompatibilityUpdateHelper,
} from "./compatibility-update-helper";
import {
  notifyRelayStartupFailure,
  notifyRelayStartupHandoff,
} from "./relay-startup-bootstrap";

interface ClosableRelayServer {
  readonly listening: boolean;
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections?(): void;
}

const HANDOFF_DRAIN_TIMEOUT_MS = 1_000;

export interface CompatibilityUpdateHandoffOptions {
  server: ClosableRelayServer;
  home: string;
  executablePath: string;
  startupChildId: string | null;
  coordinate?: typeof coordinateCompatibilityUpdateHelper;
  notifyHandoff?: typeof notifyRelayStartupHandoff;
  notifyFailure?: typeof notifyRelayStartupFailure;
  exit?: (code: number) => void;
  reportError?: (message: string) => void;
  drainTimeoutMs?: number;
}

/**
 * Stops the serving child only after a staged compatibility transition can take over safely.
 * The bootstrap parent needs the explicit handoff before this child exits, otherwise it treats a
 * successful helper launch as a failed startup and may leave the process tree running.
 */
export async function handoffPreparedCompatibilityUpdate(
  options: CompatibilityUpdateHandoffOptions,
): Promise<void> {
  const exit = options.exit ?? ((code: number): void => process.exit(code));
  try {
    await closeRelayServer(options.server, options.drainTimeoutMs);
    const disposition = await (options.coordinate ?? coordinateCompatibilityUpdateHelper)({
      home: options.home,
      argv: [],
      executablePath: options.executablePath,
      converge: async () => {},
    });
    if (disposition !== "exit") {
      throw new Error("Compatibility helper did not request a terminal Relay handoff.");
    }
    if (options.startupChildId) {
      await (options.notifyHandoff ?? notifyRelayStartupHandoff)(options.startupChildId);
    }
    exit(0);
  } catch (error) {
    if (options.startupChildId) {
      try {
        await (options.notifyFailure ?? notifyRelayStartupFailure)(options.startupChildId);
      } catch {
        // A failed handoff can race with the bootstrap parent's own shutdown.
      }
    }
    (options.reportError ?? console.error)("Compatibility helper could not start; Relay remains unavailable until repair.");
    exit(1);
  }
}

function closeRelayServer(server: ClosableRelayServer, drainTimeoutMs = HANDOFF_DRAIN_TIMEOUT_MS): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(drainTimer);
      if (error) reject(error);
      else resolve();
    };
    const drainTimer = setTimeout(() => {
      // A held loopback response cannot leave a staged update waiting indefinitely.
      if (!server.closeAllConnections) {
        finish(new Error("Relay server cannot close active connections safely."));
        return;
      }
      try {
        server.closeAllConnections();
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Relay server could not close active connections."));
      }
    }, drainTimeoutMs);
    server.close(finish);
  });
}
