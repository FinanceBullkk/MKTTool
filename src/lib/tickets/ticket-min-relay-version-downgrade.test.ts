/**
 * Phase 01 / H06: can `minRelayVersion` be downgraded so an old relay accepts a newer ticket?
 *
 * `MIN_RELAY_VERSION_BY_KIND` is a per-kind floor: a ticket kind introduced with new relay-side
 * behavior carries a version requirement, and a relay older than that must refuse it rather than
 * mishandle it. The floor is only meaningful if it cannot be lowered in transit.
 *
 * Two questions, and they are different:
 *
 *  1. **Is the floor enforced at all**, and on the correct side of the comparison? An inverted or
 *     off-by-one comparison would let exactly the relays the floor exists to exclude through.
 *  2. **Is the floor integrity-protected?** It travels inside the envelope. If an attacker can edit
 *     the envelope and have the ticket still verify, the floor is advisory. This is the actual
 *     downgrade attack and it is asserted directly rather than argued from "the envelope is signed".
 *
 * Live relevance: the deployed relay is version 9 while the code is at `RELAY_VERSION = 13`, and
 * since 18 August 2026 the security floor `MIN_RELAY_VERSION` is 13 as well. So the deployed relay
 * must be refusing every kind today, not only compatibility updates — a currently-exercised path,
 * not a hypothetical one.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { describe, expect, it } from "vitest";
import type { RelayIdentity } from "./ticket-verifier";

process.env.TICKET_SIGNING_KEY = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

const { loadServerSigningKeys } = await import("./server-signing-key");
const { generateRelayDeviceKeyPair, relayPrivateKeyToKeyObject } = await import("./relay-device-key");
const { issueTicket } = await import("./ticket-issuer");
const { verifyTicket } = await import("./ticket-verifier");
const { TicketReplayGuard } = await import("./ticket-replay-guard");
const { TICKET_KINDS, MIN_RELAY_VERSION, effectiveMinRelayVersion } = await import("./ticket-types");

// Must be the key `issueTicket` actually signs with. Using an unrelated key here would make every
// "refuses" assertion below pass on a signature mismatch instead of on the version floor.
const serverKeys = loadServerSigningKeys();
const device = generateRelayDeviceKeyPair();
const NOW = 1_760_000_000_000;

function relayAtVersion(version: number): RelayIdentity {
  return {
    deviceId: "device-1",
    version,
    privateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
    serverPublicKey: serverKeys.publicKey,
    replayGuard: new TicketReplayGuard(),
  };
}

function ticketOfKind(kind: keyof typeof TICKET_KINDS) {
  return issueTicket(
    { kind: TICKET_KINDS[kind], nickId: "nick-1", secret: "value" } as never,
    { deviceId: "device-1", publicKey: device.publicKeyHex },
    NOW,
  );
}

function accepts(ticket: string, relayVersion: number): boolean {
  try {
    verifyTicket(ticket, relayAtVersion(relayVersion), NOW);
    return true;
  } catch {
    return false;
  }
}

/** Rebuild a ticket with an edited envelope, keeping the original signature. */
function withEditedFloor(ticket: string, minRelayVersion: number): string {
  const [encoded, signature] = ticket.split(".");
  const envelope = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  envelope.minRelayVersion = minRelayVersion;
  const edited = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  return `${edited}.${signature}`;
}

describe("H06: the floor is enforced, on the correct side", () => {
  // The floor a ticket actually carries, not the table entry. Those were the same number until
  // MIN_RELAY_VERSION was raised to 13 on 18 August 2026; reading the table here would test a
  // requirement no ticket carries. See C39.
  const floor = effectiveMinRelayVersion(TICKET_KINDS.COMPATIBILITY_UPDATE);

  it("has a floor above the base version for the kind under test (fixture sanity)", () => {
    // Without this the comparison tests below would be vacuous.
    expect(floor).toBeGreaterThan(1);
  });

  it("refuses a relay one version below the floor", () => {
    expect(accepts(ticketOfKind("COMPATIBILITY_UPDATE"), floor - 1)).toBe(false);
  });

  it("accepts a relay exactly at the floor (boundary)", () => {
    expect(accepts(ticketOfKind("COMPATIBILITY_UPDATE"), floor)).toBe(true);
  });

  it("accepts a relay above the floor", () => {
    expect(accepts(ticketOfKind("COMPATIBILITY_UPDATE"), floor + 5)).toBe(true);
  });

  it("refuses the version-9 relay that is actually deployed", () => {
    // The live configuration, pinned: relay 9 must not act on this ticket.
    expect(accepts(ticketOfKind("COMPATIBILITY_UPDATE"), 9)).toBe(false);
  });

  it("refuses every kind below the security floor", () => {
    /**
     * **This replaced a differential that the 18 August policy change made vacuous**, and the
     * reason is worth keeping rather than quietly deleting.
     *
     * The old assertion was that a relay at 9 still gets credential tickets while being refused
     * compatibility updates — the per-kind design working, so that a new ticket kind cannot lock
     * old relays out of unrelated work. That was true while `MIN_RELAY_VERSION` was 1.
     *
     * Raising it to 13 deliberately overrides that: the security floor applies to every kind, which
     * is the entire point of having one. Since 13 now exceeds every capability entry in the table,
     * the per-kind mechanism is **dormant** — no two kinds have different effective floors today.
     * It is not gone, and `ticket-min-version-by-kind.test.ts` still pins the table, so it comes
     * back the moment a kind needs a version above the security floor.
     */
    for (const kind of ["CREDENTIAL", "COMPATIBILITY_UPDATE"] as const) {
      expect(accepts(ticketOfKind(kind), MIN_RELAY_VERSION - 1)).toBe(false);
      expect(accepts(ticketOfKind(kind), MIN_RELAY_VERSION)).toBe(true);
    }
  });
});

describe("H06: the floor cannot be downgraded in transit", () => {
  it("refuses a ticket whose floor was lowered to let an old relay through", () => {
    /**
     * The downgrade attack. The envelope is edited to claim floor 1 and the original signature is
     * kept. If this were accepted, every per-kind floor would be advisory.
     */
    const ticket = ticketOfKind("COMPATIBILITY_UPDATE");
    const downgraded = withEditedFloor(ticket, 1);

    // Confirm the edit really changed the envelope, so a rejection is not vacuous.
    expect(downgraded).not.toBe(ticket);
    expect(
      JSON.parse(Buffer.from(downgraded.split(".")[0], "base64url").toString("utf8")),
    ).toMatchObject({ minRelayVersion: 1 });

    expect(accepts(downgraded, 9)).toBe(false);
    // Differential: the unedited ticket is accepted by a relay that meets the real floor, so the
    // rejection above is attributable to the edit and not to the fixture.
    expect(accepts(ticket, effectiveMinRelayVersion(TICKET_KINDS.COMPATIBILITY_UPDATE))).toBe(true);
  });

  it("refuses a ticket whose floor was raised, too", () => {
    // Integrity is two-directional: an attacker who can raise the floor can deny service.
    const ticket = ticketOfKind("CREDENTIAL");
    expect(accepts(withEditedFloor(ticket, 99), 9)).toBe(false);
  });

  it("refuses an envelope with a missing or non-numeric floor", () => {
    const ticket = ticketOfKind("CREDENTIAL");
    const [encoded, signature] = ticket.split(".");
    const envelope = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;

    delete envelope.minRelayVersion;
    const missing = `${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}.${signature}`;
    expect(accepts(missing, 99)).toBe(false);

    envelope.minRelayVersion = "1";
    const asText = `${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url")}.${signature}`;
    expect(accepts(asText, 99)).toBe(false);
  });
});
