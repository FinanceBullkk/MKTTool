import type { IncomingMessage } from "node:http";
import type { MktBrowserLicenseCapacity } from "../../src/lib/antidetect/mkt-browser-contract";
import type { RelayResponseBody } from "./relay-http-server";

export interface LicenseCapacityRefreshDeps {
  allowedOrigin: string | null;
  antidetect: {
    refreshLicenseCapacity(): Promise<MktBrowserLicenseCapacity | null>;
  };
}

export async function handleLicenseCapacityRefresh(
  request: IncomingMessage,
  deps: LicenseCapacityRefreshDeps,
): Promise<RelayResponseBody> {
  if (!deps.allowedOrigin) {
    return {
      ok: false,
      message: "This Relay build has no trusted web origin and cannot refresh browser capacity.",
    };
  }
  if (request.headers.origin !== deps.allowedOrigin) {
    return {
      ok: false,
      message: `Only ${deps.allowedOrigin} can refresh browser capacity on this Relay PC.`,
    };
  }

  try {
    const licenseCapacity = await deps.antidetect.refreshLicenseCapacity();
    if (!licenseCapacity) {
      return {
        ok: false,
        message: "MKT Browser did not return a valid licence-capacity result. Open it and check again.",
      };
    }
    return {
      ok: true,
      message: "Browser licence capacity refreshed.",
      licenseCapacity,
    };
  } catch {
    return {
      ok: false,
      message: "MKT Browser could not refresh licence capacity. Open it and check again.",
    };
  }
}
