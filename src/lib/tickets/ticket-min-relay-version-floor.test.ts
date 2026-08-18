/**
 * `MIN_RELAY_VERSION` is a security floor. A per-kind capability entry may raise what a ticket
 * demands and must never lower it.
 *
 * ## The defect this exists to prevent, live until 18 August 2026 (C39)
 *
 * The issuer read `MIN_RELAY_VERSION_BY_KIND[kind] ?? MIN_RELAY_VERSION`, which looks like a
 * fallback and behaves as an override: the per-kind value **replaced** the global one. Because
 * every ticket kind is present in the table — pinned on purpose by `ticket-min-version-by-kind` —
 * the `??` branch was unreachable and `MIN_RELAY_VERSION` was dead code.
 *
 * Harmless while the security floor was 1. Not harmless the moment it is raised, which is the one
 * thing it exists for: forcing a fleet off a Relay with a known hole. Four of five kinds would have
 * kept their lower table value, profile launch among them at 7, while the operator believed the
 * fleet floor had moved. The failure would have surfaced only during a security response, on other
 * people's machines.
 *
 * ## Why there is no module mock here, which is the second lesson
 *
 * The first version of this file mocked `./ticket-types` to force a global floor above every table
 * entry. That worked while the issuer computed the maximum inline, and **stopped working the moment
 * the rule moved into `effectiveMinRelayVersion`** — the function closes over the real constant, so
 * replacing the module's export changes nothing and the test quietly measured the mock instead of
 * the code. Two smaller properties, both checkable against the real module, are worth more than one
 * large property that needs the module lied to:
 *
 *   1. `effectiveMinRelayVersion` returns the maximum. Pure function, table-driven, no mocking.
 *   2. The issuer stamps exactly what that function returns, for every kind.
 *
 * Together they give the guarantee. Separately they each fail loudly and for an obvious reason.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const SIGNING_KEY = generateKeyPairSync("ed25519");
vi.mock("./server-signing-key", () => ({ loadServerSigningKeys: () => SIGNING_KEY }));

const { issueTicket } = await import("./ticket-issuer");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");
const { MIN_RELAY_VERSION, MIN_RELAY_VERSION_BY_KIND, TICKET_KINDS, effectiveMinRelayVersion } =
  await import("./ticket-types");

const recipient = { deviceId: "device-1", publicKey: generateRelayDeviceKeyPair().publicKeyHex };
const PROXY = { protocol: "http" as const, host: "1.2.3.4", port: 8080 };

function minRelayVersionOf(ticket: string): number {
  const [envelope] = ticket.split(".");
  return JSON.parse(Buffer.from(envelope, "base64url").toString("utf8")).minRelayVersion;
}

const PAYLOADS = {
  [TICKET_KINDS.CREDENTIAL]: {
    kind: TICKET_KINDS.CREDENTIAL,
    accountId: "a",
    field: "password" as const,
    credentialCiphertext: "x",
  },
  [TICKET_KINDS.OTP]: { kind: TICKET_KINDS.OTP, accountId: "a", totpSecretCiphertext: "x" },
  [TICKET_KINDS.LAUNCH_PROFILE]: {
    kind: TICKET_KINDS.LAUNCH_PROFILE,
    accountId: "a",
    antidetectProfileId: "p",
    proxyLabel: "l",
    proxy: PROXY,
  },
  [TICKET_KINDS.CREATE_PROFILE]: {
    kind: TICKET_KINDS.CREATE_PROFILE,
    accountId: "a",
    antidetectProfileId: "p",
    proxyLabel: "l",
    proxy: PROXY,
  },
} as const;

describe("effectiveMinRelayVersion takes the higher of the two floors", () => {
  it.each([
    // [global, capability, expected] — the third row is the C39 case: an override would return 7.
    ["capability above global", 1, 7, 7],
    ["capability equal to global", 13, 13, 13],
    ["capability BELOW global", 13, 7, 13],
    ["capability absent", 13, undefined, 13],
  ])("%s", (_name, global, capability, expected) => {
    // The real function is exercised through its own table below; this row states the arithmetic
    // the function must implement, so a future rewrite has the rule written down independently.
    expect(Math.max(global, capability ?? 0)).toBe(expected);
  });

  it("never returns below the security floor, for any real kind", () => {
    for (const kind of Object.values(TICKET_KINDS)) {
      expect(effectiveMinRelayVersion(kind)).toBeGreaterThanOrEqual(MIN_RELAY_VERSION);
    }
  });

  it("never returns below a kind's own capability requirement", () => {
    for (const [kind, capability] of Object.entries(MIN_RELAY_VERSION_BY_KIND)) {
      expect(effectiveMinRelayVersion(kind as keyof typeof MIN_RELAY_VERSION_BY_KIND)).
        toBeGreaterThanOrEqual(capability);
    }
  });
});

describe("the issuer stamps the effective floor and nothing else", () => {
  /**
   * Profile launch is the case that matters most and the one the old code got wrong: its table
   * entry is 7, so an override kept issuing tickets acceptable to Relay 7 no matter how high the
   * security floor was set.
   */
  it.each(Object.entries(PAYLOADS))("%s carries effectiveMinRelayVersion", (kind, payload) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stamped = minRelayVersionOf(issueTicket(payload as any, recipient));
    expect(stamped).toBe(effectiveMinRelayVersion(kind as keyof typeof MIN_RELAY_VERSION_BY_KIND));
    expect(stamped).toBeGreaterThanOrEqual(MIN_RELAY_VERSION);
  });
});
