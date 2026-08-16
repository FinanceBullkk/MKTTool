/**
 * Phase 01 / H07: is the ticket rate limit keyed so one actor cannot spend another's budget?
 *
 * The limit is the only thing bounding how fast an authenticated account can mint tickets, and each
 * ticket is a request to reveal a credential or open a profile. Two failure shapes:
 *
 *  1. **Shared bucket.** If the key is anything coarser than the individual account — a constant, an
 *     empty string, or a value that collides between accounts — then one busy or hostile user
 *     denies service to everyone else, and the limit protects nobody in particular.
 *
 *  2. **Window that never closes, or closes too early.** A limit that resets on every call is not a
 *     limit; one that never resets locks a legitimate account out permanently.
 *
 * The store is a process-local `Map`, which is a deliberate trade-off documented in the module. That
 * has a consequence no unit test can observe and it is recorded at the end of this file rather than
 * left implied.
 *
 * No real accounts. Identifiers are synthetic.
 */
import { beforeEach, describe, expect, it } from "vitest";

const { checkTicketRateLimit, resetTicketRateLimit } = await import("./ticket-rate-limit");

const MAX_PER_WINDOW = 10;
const WINDOW_MS = 60_000;
const NOW = 1_760_000_000_000;

beforeEach(() => {
  resetTicketRateLimit();
});

/** Spend `count` of a user's budget and report how many were allowed. */
function spend(userId: string, count: number, at: number = NOW): number {
  let allowed = 0;
  for (let i = 0; i < count; i += 1) {
    if (checkTicketRateLimit(userId, at).allowed) allowed += 1;
  }
  return allowed;
}

describe("H07: the limit exists and is the documented size", () => {
  it("allows exactly the window budget and then denies", () => {
    expect(spend("user-a", MAX_PER_WINDOW)).toBe(MAX_PER_WINDOW);
    expect(checkTicketRateLimit("user-a", NOW).allowed).toBe(false);
  });

  it("keeps denying while the window is still open", () => {
    spend("user-a", MAX_PER_WINDOW);
    expect(checkTicketRateLimit("user-a", NOW + WINDOW_MS - 1).allowed).toBe(false);
  });

  it("allows again once the window has fully elapsed", () => {
    spend("user-a", MAX_PER_WINDOW);
    expect(checkTicketRateLimit("user-a", NOW + WINDOW_MS).allowed).toBe(true);
  });

  it("carries an explanatory message when it denies", () => {
    spend("user-a", MAX_PER_WINDOW);
    const verdict = checkTicketRateLimit("user-a", NOW);
    expect(verdict.allowed).toBe(false);
    expect(verdict.message.length).toBeGreaterThan(0);
  });
});

describe("H07: per-actor isolation", () => {
  it("does not let one account spend another's budget", () => {
    /**
     * The central hypothesis, asserted differentially: the same call, at the same instant, must
     * succeed for a user who has spent nothing and fail for one who has spent everything. A shared
     * bucket would deny both.
     */
    expect(spend("noisy", MAX_PER_WINDOW)).toBe(MAX_PER_WINDOW);

    expect(checkTicketRateLimit("noisy", NOW).allowed).toBe(false);
    expect(checkTicketRateLimit("quiet", NOW).allowed).toBe(true);
  });

  it("gives every account its own full budget concurrently", () => {
    const users = ["u1", "u2", "u3", "u4", "u5"];
    for (const user of users) {
      expect(spend(user, MAX_PER_WINDOW)).toBe(MAX_PER_WINDOW);
    }
    // All five exhausted independently; none was cut short by the others.
    for (const user of users) {
      expect(checkTicketRateLimit(user, NOW).allowed).toBe(false);
    }
  });

  it("does not collide between similar identifiers", () => {
    // Guards against a key built by concatenation, where "a" + "bc" and "ab" + "c" would merge.
    spend("a", MAX_PER_WINDOW);
    for (const other of ["a ", " a", "A", "aa", ""]) {
      expect(checkTicketRateLimit(other, NOW).allowed).toBe(true);
    }
  });

  it("isolates the empty identifier rather than pooling every caller into it", () => {
    // If an unauthenticated path ever reaches this, callers must not share one bucket with users.
    spend("", MAX_PER_WINDOW);
    expect(checkTicketRateLimit("", NOW).allowed).toBe(false);
    expect(checkTicketRateLimit("user-a", NOW).allowed).toBe(true);
  });
});

describe("H07: window behavior", () => {
  it("expires spend individually rather than clearing the whole bucket", () => {
    /**
     * A sliding window: nine tickets at t0 and one at t0+30s means that at t0+WINDOW the nine have
     * aged out but the tenth has not. Budget available must therefore be 9, not 10 — a
     * fixed-window implementation that clears wholesale would give 10 and let a caller burst 19
     * across the boundary.
     */
    spend("user-a", MAX_PER_WINDOW - 1, NOW);
    expect(checkTicketRateLimit("user-a", NOW + WINDOW_MS / 2).allowed).toBe(true);

    const atBoundary = NOW + WINDOW_MS;
    expect(spend("user-a", MAX_PER_WINDOW, atBoundary)).toBe(MAX_PER_WINDOW - 1);
  });

  it("restores the full budget once every recorded issue has aged out", () => {
    spend("user-a", MAX_PER_WINDOW);
    expect(spend("user-a", MAX_PER_WINDOW, NOW + WINDOW_MS * 2)).toBe(MAX_PER_WINDOW);
  });

  it("does not let a past timestamp resurrect spent budget", () => {
    // A caller-supplied clock going backwards must not widen the limit.
    spend("user-a", MAX_PER_WINDOW);
    expect(checkTicketRateLimit("user-a", NOW - WINDOW_MS).allowed).toBe(false);
  });
});

describe("H07: process-local storage", () => {
  it("resets completely when the process state is cleared", () => {
    /**
     * OBSERVATION, recorded as executable fact rather than prose.
     *
     * The counter lives in a module-level Map, so it is per-process. `resetTicketRateLimit` is the
     * test seam, but a deploy, a crash, or a second server instance has the same effect: the budget
     * starts over. On a multi-instance deployment the effective limit is
     * `MAX_TICKETS_PER_WINDOW × instances`, and no unit test can observe that.
     *
     * Not ranked as a finding — the module documents the trade-off deliberately, and the limit is a
     * throttle rather than an authorization control. It matters only if it is ever relied on as the
     * latter, which is why it is pinned here.
     */
    spend("user-a", MAX_PER_WINDOW);
    expect(checkTicketRateLimit("user-a", NOW).allowed).toBe(false);

    resetTicketRateLimit();
    expect(checkTicketRateLimit("user-a", NOW).allowed).toBe(true);
  });
});
