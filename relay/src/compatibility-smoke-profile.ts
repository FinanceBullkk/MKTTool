import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { planProfileFingerprint } from "../../src/lib/antidetect/profile-fingerprint-plan";
import type { CompatibilityUpdateAuthorization } from "../../src/lib/release/compatibility-update-authorization";
import type { TicketPayload } from "../../src/lib/tickets/ticket-types";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import type { CompatibilityUpdateState } from "./update-state";

export const COMPATIBILITY_SMOKE_PROFILE_TAG = "mkttool-compatibility-smoke";
const COMPATIBILITY_SMOKE_EXTERNAL_REF = "mkttool:compatibility-smoke";

type UpdatePayload = Extract<
  TicketPayload,
  { kind: typeof TICKET_KINDS.COMPATIBILITY_UPDATE }
>;

export async function ensureCompatibilitySmokeProfile(options: {
  state: CompatibilityUpdateState;
  payload: UpdatePayload["smokeProfile"];
  authorization: CompatibilityUpdateAuthorization;
  adapter: Pick<AntidetectAdapter, "listProfiles" | "fingerprintOptions" | "createProfile">;
}): Promise<string> {
  if (options.state.smokeProfileId) {
    const profiles = await options.adapter.listProfiles();
    if (profiles.some((profile) => profile.id === options.state.smokeProfileId)) {
      return options.state.smokeProfileId;
    }
  }

  const fingerprint = planProfileFingerprint({
    proxyCountry: options.payload.proxyCountry,
    seedKey: COMPATIBILITY_SMOKE_EXTERNAL_REF,
    options: await options.adapter.fingerprintOptions(),
  });
  if (!fingerprint.ok) throw new Error(fingerprint.failure.message);

  const created = await options.adapter.createProfile({
    name: "MKTTool compatibility smoke",
    notes: `No-login update smoke profile using ${options.payload.proxyLabel}.`,
    tags: ["mkttool", COMPATIBILITY_SMOKE_PROFILE_TAG],
    proxy: options.payload.proxy,
    fingerprint: fingerprint.plan,
    seed: fingerprint.seed,
    externalRef: COMPATIBILITY_SMOKE_EXTERNAL_REF,
    requestId: options.authorization.authorizationId,
    operationId: options.authorization.authorizationId,
  });
  return created.profileId;
}
