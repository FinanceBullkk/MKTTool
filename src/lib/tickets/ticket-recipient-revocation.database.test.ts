/**
 * Phase 01 / H08: can a revoked device still be resolved as a ticket recipient?
 *
 * Revocation is documented as one-way and unrecoverable — `RelayDevice.revokedAt`'s schema comment
 * states that a lost machine's key is treated as compromised and that re-enabling it would erase the
 * meaning of the revocation. That guarantee is only as good as every lookup that selects a recipient.
 *
 * There are three such lookups in `ticket-recipient-lookup.ts`, and they filter independently:
 *
 *  - `resolveNickDeviceRecipient` checks `device.revokedAt` in code (`:155`)
 *  - `resolveTicketRecipient` filters `revokedAt: null` in the query (`:55`)
 *  - `listActiveRelayDevices` filters `revokedAt: null` in the query (`:186`)
 *
 * Only the first had coverage. Disabling all three left the existing suites green except for one
 * test in `nick-device-recipient.database.test.ts`, so the two query-level filters were unverified.
 * This file covers them, with the sharpest case being a caller who names the revoked device
 * explicitly — the only path where the revoked id is attacker-supplied rather than merely present.
 *
 * Synthetic users and keys. No real accounts, no operational data.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

const { prisma } = await import("@/lib/db/prisma-client");
const { resolveTicketRecipient, listActiveRelayDevices } = await import("./ticket-recipient-lookup");
type Actor = import("@/lib/auth/require-actor").Actor;

const OWNER_ID = "user-owner";
const owner: Actor = { userId: OWNER_ID, email: "owner@mkttool.local", role: "OPERATOR" };

const ACTIVE_KEY = "a".repeat(64);
const REVOKED_KEY = "b".repeat(64);

let activeDeviceId: string;
let revokedDeviceId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: { id: OWNER_ID, name: "Owner", email: "owner@mkttool.local", updatedAt: new Date() },
  });

  const [active, revoked] = await Promise.all([
    prisma.relayDevice.create({
      data: { name: "Active laptop", userId: OWNER_ID, publicKey: ACTIVE_KEY },
    }),
    prisma.relayDevice.create({
      data: {
        name: "Lost laptop",
        userId: OWNER_ID,
        publicKey: REVOKED_KEY,
        revokedAt: new Date(),
      },
    }),
  ]);
  activeDeviceId = active.id;
  revokedDeviceId = revoked.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("H08: resolveTicketRecipient never selects a revoked device", () => {
  it("refuses when the caller names the revoked device explicitly", async () => {
    /**
     * The sharpest case: the revoked id is caller-supplied. If this resolved, a ticket would be
     * sealed to a key the project has already declared compromised.
     */
    const result = await resolveTicketRecipient(owner, revokedDeviceId);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.message).not.toContain(REVOKED_KEY);
  });

  it("selects the active device when both exist, and never the revoked key", async () => {
    // With a revoked sibling present, the lookup must be filtering rather than merely ordering.
    const result = await resolveTicketRecipient(owner);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.recipient.publicKey).toBe(ACTIVE_KEY);
    expect(result.recipient.publicKey).not.toBe(REVOKED_KEY);
  });

  it("refuses outright when every device the user owns is revoked", async () => {
    // Differential against the case above: same call, only the active device's status differs.
    await prisma.relayDevice.update({
      where: { id: activeDeviceId },
      data: { revokedAt: new Date() },
    });

    const result = await resolveTicketRecipient(owner);
    expect(result.ok).toBe(false);
  });

  it("stops selecting a device the moment it is revoked (before/after)", async () => {
    /**
     * The strongest form of the assertion: one device, one call, the only change being revocation.
     * A pass here cannot be attributed to the presence of a sibling or to ordering.
     */
    await prisma.relayDevice.delete({ where: { id: revokedDeviceId } });

    const before = await resolveTicketRecipient(owner, activeDeviceId);
    expect(before.ok).toBe(true);

    await prisma.relayDevice.update({
      where: { id: activeDeviceId },
      data: { revokedAt: new Date() },
    });

    const after = await resolveTicketRecipient(owner, activeDeviceId);
    expect(after.ok).toBe(false);
  });
});

describe("H08: listActiveRelayDevices excludes revoked devices", () => {
  it("omits the revoked device from the picker", async () => {
    // This list drives the device chooser, so a revoked entry would invite an operator to pick it.
    const devices = await listActiveRelayDevices(OWNER_ID);

    expect(devices.map((d) => d.id)).toEqual([activeDeviceId]);
    expect(devices.map((d) => d.id)).not.toContain(revokedDeviceId);
  });

  it("returns nothing once every device is revoked", async () => {
    await prisma.relayDevice.update({
      where: { id: activeDeviceId },
      data: { revokedAt: new Date() },
    });

    expect(await listActiveRelayDevices(OWNER_ID)).toEqual([]);
  });

  it("does not list another user's active devices", async () => {
    // Ownership and revocation are separate filters on the same query; neither may mask the other.
    await prisma.user.create({
      data: { id: "user-other", name: "Other", email: "other@mkttool.local", updatedAt: new Date() },
    });
    await prisma.relayDevice.create({
      data: { name: "Other laptop", userId: "user-other", publicKey: "c".repeat(64) },
    });

    expect(await listActiveRelayDevices(OWNER_ID)).toEqual([
      { id: activeDeviceId, name: "Active laptop" },
    ]);
  });
});
