/**
 * `MIN_RELAY_VERSION` is a floor. A per-kind entry may raise it and must never lower it.
 *
 * ## Why this is a separate file from `ticket-min-version-by-kind.test.ts`
 *
 * That file pins the opposite direction — that raising one kind does not drag the others up — and
 * it does so against the real table. This one has to make the global floor and a per-kind entry
 * disagree, which means mocking `./ticket-types`, and a module mock cannot be scoped to one
 * `describe` block within a file that already imports the real table.
 *
 * ## The defect this exists to prevent, which was live until 18 August 2026 (C39)
 *
 * The issuer read `MIN_RELAY_VERSION_BY_KIND[kind] ?? MIN_RELAY_VERSION`, which looks like a
 * fallback but is an override: the per-kind value **replaces** the global one. Because every ticket
 * kind is present in the table — pinned on purpose by the sibling test — the `??` branch was
 * unreachable and `MIN_RELAY_VERSION` was dead code.
 *
 * Harmless while the global floor is 1. Not harmless the moment anyone raises it, which is the one
 * thing it exists for: forcing a fleet off a Relay version with a known hole. Four of the five
 * kinds would have kept their old, lower floor, profile launch among them, and the server would
 * have reported that it had raised the floor while continuing to serve the versions it meant to
 * lock out. The failure would have appeared only during a security response, on other people's
 * machines.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const SIGNING_KEY = generateKeyPairSync("ed25519");
vi.mock("./server-signing-key", () => ({ loadServerSigningKeys: () => SIGNING_KEY }));

const actualTypes = await vi.importActual<typeof import("./ticket-types")>("./ticket-types");

/**
 * A global floor deliberately above every real per-kind entry, so that an implementation which
 * lets the table win produces a visibly wrong number rather than a coincidentally right one.
 */
const RAISED_FLOOR = 99;

vi.mock("./ticket-types", async () => {
  const real = await vi.importActual<typeof import("./ticket-types")>("./ticket-types");
  return { ...real, MIN_RELAY_VERSION: 99 };
});

const { issueTicket } = await import("./ticket-issuer");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");

const recipient = { deviceId: "device-1", publicKey: generateRelayDeviceKeyPair().publicKeyHex };
const PROXY = { protocol: "http" as const, host: "1.2.3.4", port: 8080 };

function minRelayVersionOf(ticket: string): number {
  const [envelope] = ticket.split(".");
  return JSON.parse(Buffer.from(envelope, "base64url").toString("utf8")).minRelayVersion;
}

const PAYLOADS = {
  [actualTypes.TICKET_KINDS.CREDENTIAL]: {
    kind: actualTypes.TICKET_KINDS.CREDENTIAL,
    accountId: "a",
    field: "password" as const,
    credentialCiphertext: "x",
  },
  [actualTypes.TICKET_KINDS.OTP]: {
    kind: actualTypes.TICKET_KINDS.OTP,
    accountId: "a",
    totpSecretCiphertext: "x",
  },
  [actualTypes.TICKET_KINDS.LAUNCH_PROFILE]: {
    kind: actualTypes.TICKET_KINDS.LAUNCH_PROFILE,
    accountId: "a",
    antidetectProfileId: "p",
    proxyLabel: "l",
    proxy: PROXY,
  },
  [actualTypes.TICKET_KINDS.CREATE_PROFILE]: {
    kind: actualTypes.TICKET_KINDS.CREATE_PROFILE,
    accountId: "a",
    antidetectProfileId: "p",
    proxyLabel: "l",
    proxy: PROXY,
  },
} as const;

describe("a raised global floor cannot be undercut by the per-kind table", () => {
  /**
   * Profile launch is called out by name because it is the case that matters most and the one the
   * old code got wrong: its table entry is 7, so an override would have kept issuing tickets to
   * Relay 7 while the operator believed the fleet floor was far higher.
   */
  it.each(Object.entries(PAYLOADS))(
    "%s is issued at the global floor, not its lower table entry",
    (_kind, payload) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(minRelayVersionOf(issueTicket(payload as any, recipient))).toBe(RAISED_FLOOR);
    },
  );

  it("every real per-kind entry is at or above the real global floor", () => {
    // Guards the table itself rather than the issuer. With Math.max in place a low entry is no
    // longer dangerous, but it is still a lie about intent, and this is where it gets caught.
    for (const [kind, floor] of Object.entries(actualTypes.MIN_RELAY_VERSION_BY_KIND)) {
      expect(floor, `${kind} sits below MIN_RELAY_VERSION`).toBeGreaterThanOrEqual(
        actualTypes.MIN_RELAY_VERSION,
      );
    }
  });
});
