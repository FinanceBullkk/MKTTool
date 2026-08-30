/**
 * Durable, fail-closed storage for the Relay's spent-ticket set.
 *
 * The journal is security state, not a cache. A missing, malformed, unreadable, or partially
 * written file must stop ticket processing instead of silently resetting the replay guard. The
 * first launch is the one exception: it creates an empty journal and a small initialization
 * marker. Once the marker exists, deleting the journal is an error and never creates a fresh one
 * implicitly.
 */
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import type { SpentTicketRecord } from "../../src/lib/tickets/ticket-replay-guard";

export const SPENT_TICKET_JOURNAL_FILE = "spent-tickets.json";
export const SPENT_TICKET_JOURNAL_MARKER_FILE = "spent-tickets.initialized";

const MARKER_CONTENT = "mkttool-spent-ticket-journal-v1\n";
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const MAX_RECORDS = 100_000;
const MAX_JTI_LENGTH = 256;

export type SpentTicketJournalErrorCode =
  | "MISSING"
  | "CORRUPT"
  | "UNREADABLE"
  | "INVALID"
  | "WRITE_FAILED"
  | "DURABILITY_FAILED";

/** Safe, typed error used by startup and persistence callers. */
export class SpentTicketJournalError extends Error {
  constructor(
    readonly code: SpentTicketJournalErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SpentTicketJournalError";
  }
}

function journalPath(home: string): string {
  return path.join(home, SPENT_TICKET_JOURNAL_FILE);
}

function markerPath(home: string): string {
  return path.join(home, SPENT_TICKET_JOURNAL_MARKER_FILE);
}

function isRecordShaped(value: unknown): value is SpentTicketRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Partial<SpentTicketRecord>;
  return (
    typeof record.jti === "string" &&
    record.jti.length > 0 &&
    record.jti.length <= MAX_JTI_LENGTH &&
    !/[\u0000\r\n]/.test(record.jti) &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt) &&
    record.expiresAt >= 0
  );
}

function readFileStrict(filePath: string, kind: "journal" | "initialization marker"): string {
  let stats;
  try {
    stats = statSync(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new SpentTicketJournalError(
        "MISSING",
        `Spent-ticket ${kind} is missing; preserve the Relay home and restore the file before retrying.`,
        { cause: error },
      );
    }
    throw new SpentTicketJournalError(
      "UNREADABLE",
      `Spent-ticket ${kind} cannot be inspected; ticket processing is disabled until permissions are repaired.`,
      { cause: error },
    );
  }

  if (!stats.isFile() || stats.size > MAX_JOURNAL_BYTES) {
    throw new SpentTicketJournalError(
      "CORRUPT",
      `Spent-ticket ${kind} is not a bounded regular file; preserve it and restore a known-good copy.`,
    );
  }

  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    throw new SpentTicketJournalError(
      "UNREADABLE",
      `Spent-ticket ${kind} cannot be read; ticket processing is disabled until permissions are repaired.`,
      { cause: error },
    );
  }
}

function parseJournal(text: string, filePath: string): SpentTicketRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new SpentTicketJournalError(
      "CORRUPT",
      `Spent-ticket journal is not valid JSON; preserve ${path.basename(filePath)} and restore a known-good copy.`,
      { cause: error },
    );
  }

  if (!Array.isArray(parsed) || parsed.length > MAX_RECORDS) {
    throw new SpentTicketJournalError(
      "CORRUPT",
      `Spent-ticket journal must be an array of at most ${MAX_RECORDS} records; no ticket will be accepted.`,
    );
  }

  const seen = new Set<string>();
  const records: SpentTicketRecord[] = [];
  for (const value of parsed) {
    if (!isRecordShaped(value)) {
      throw new SpentTicketJournalError(
        "INVALID",
        "Spent-ticket journal contains an invalid record; preserve it and restore a known-good copy.",
      );
    }
    if (seen.has(value.jti)) {
      throw new SpentTicketJournalError(
        "INVALID",
        "Spent-ticket journal contains duplicate ticket ids; preserve it and restore a known-good copy.",
      );
    }
    seen.add(value.jti);
    records.push({ jti: value.jti, expiresAt: value.expiresAt });
  }
  return records;
}

function validateRecords(records: readonly SpentTicketRecord[]): SpentTicketRecord[] {
  if (records.length > MAX_RECORDS) {
    throw new SpentTicketJournalError(
      "INVALID",
      `Cannot persist more than ${MAX_RECORDS} spent tickets; ticket processing is stopped.`,
    );
  }
  const seen = new Set<string>();
  const normalized: SpentTicketRecord[] = [];
  for (const record of records) {
    if (!isRecordShaped(record)) {
      throw new SpentTicketJournalError(
        "INVALID",
        "Cannot persist an invalid spent-ticket record; ticket processing is stopped.",
      );
    }
    if (seen.has(record.jti)) {
      throw new SpentTicketJournalError(
        "INVALID",
        "Cannot persist duplicate spent-ticket ids; ticket processing is stopped.",
      );
    }
    seen.add(record.jti);
    normalized.push({ jti: record.jti, expiresAt: record.expiresAt });
  }
  return normalized;
}

function flushDirectory(home: string): void {
  // Windows supports fsync on the file handle used above. Directory handles are not consistently
  // openable across supported Windows versions; tolerate only documented unsupported errors.
  let fd: number | undefined;
  try {
    fd = openSync(home, "r");
    fsyncSync(fd);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EINVAL" && code !== "EPERM" && code !== "ENOTSUP" && code !== "EISDIR") {
      throw new SpentTicketJournalError(
        "DURABILITY_FAILED",
        "Spent-ticket journal directory flush failed; no new ticket is accepted.",
        { cause: error },
      );
    }
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // The directory flush already completed or was explicitly unsupported.
      }
    }
  }
}

function writeDurably(filePath: string, content: string, home: string, exclusive: boolean): void {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  let fd: number | undefined;
  try {
    fd = openSync(temporary, exclusive ? "wx" : "w", 0o600);
    const bytes = Buffer.from(content, "utf8");
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
    // Deterministic fault injection for the P2-13 durability test. It only makes the operation
    // fail closed; leaving the variable unset is the production path.
    if (process.env.RELAY_JOURNAL_FAULT === "after-fsync") {
      throw new SpentTicketJournalError(
        "DURABILITY_FAILED",
        "Simulated journal flush interruption; no new ticket is accepted.",
      );
    }
    closeSync(fd);
    fd = undefined;
    if (process.env.RELAY_JOURNAL_FAULT === "before-rename") {
      throw new SpentTicketJournalError(
        "DURABILITY_FAILED",
        "Simulated journal rename interruption; no new ticket is accepted.",
      );
    }
    renameSync(temporary, filePath);
    flushDirectory(home);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the original failure.
      }
    }
    try {
      unlinkSync(temporary);
    } catch {
      // A leftover temp file is harmless while the destination remains authoritative.
    }
    if (error instanceof SpentTicketJournalError) throw error;
    throw new SpentTicketJournalError(
      "WRITE_FAILED",
      "Spent-ticket journal could not be durably written; no new ticket is accepted.",
      { cause: error },
    );
  }
}

function readMarker(home: string): void {
  const marker = readFileStrict(markerPath(home), "initialization marker");
  if (marker !== MARKER_CONTENT) {
    throw new SpentTicketJournalError(
      "CORRUPT",
      "Spent-ticket journal initialization marker is invalid; preserve the Relay home and repair it manually.",
    );
  }
}

/** Ensure the journal exists without replacing an existing or previously initialized state. */
export function ensureSpentTicketJournal(home: string): void {
  mkdirSync(home, { recursive: true });
  const destination = journalPath(home);
  const marker = markerPath(home);
  const destinationExists = existsSync(destination);
  const markerExists = existsSync(marker);

  if (destinationExists) {
    // Validate before creating a marker; a corrupt legacy file must never be blessed.
    readSpentTickets(home);
    if (!markerExists) writeDurably(marker, MARKER_CONTENT, home, true);
    else readMarker(home);
    return;
  }

  if (markerExists) {
    readMarker(home);
    throw new SpentTicketJournalError(
      "MISSING",
      "Spent-ticket journal is missing after initialization; preserve the Relay home and restore it before retrying.",
    );
  }

  // A temp file with no destination means a crash interrupted the first write. Do not silently
  // treat that as a clean first launch.
  const tempFound = readdirSync(home).some(
    (name) => name.startsWith(`${SPENT_TICKET_JOURNAL_FILE}.`) && name.endsWith(".tmp"),
  );
  if (tempFound) {
    throw new SpentTicketJournalError(
      "CORRUPT",
      "Spent-ticket journal has an interrupted temporary write; preserve the Relay home and repair it before retrying.",
    );
  }

  writeDurably(destination, "[]\n", home, true);
  // Never remove the valid journal if marker creation fails. Startup remains fail-closed.
  writeDurably(marker, MARKER_CONTENT, home, true);
}

/** Read and strictly validate the initialized journal. */
export function readSpentTickets(home: string): SpentTicketRecord[] {
  const filePath = journalPath(home);
  const text = readFileStrict(filePath, "journal");
  return parseJournal(text, filePath);
}

/** Persist a complete snapshot after flushing it before an atomic rename. */
export function writeSpentTickets(home: string, records: readonly SpentTicketRecord[]): void {
  mkdirSync(home, { recursive: true });
  const normalized = validateRecords(records);
  writeDurably(journalPath(home), `${JSON.stringify(normalized, null, 2)}\n`, home, false);
}
