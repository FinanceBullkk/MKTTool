import { describe, expect, it } from "vitest";
import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import { SECRET_REVEAL_PATH } from "./secret-page";
import { RELAY_ROUTE_CAPABILITIES, RELAY_ROUTE_POLICIES } from "./relay-route-policy";

describe("Relay route exposure policy", () => {
  it("classifies every owned JSON endpoint exactly once", () => {
    const expectedPaths = [
      ...Object.values(RELAY_PATHS).filter((path) => path !== RELAY_PATHS.secret),
      SECRET_REVEAL_PATH,
    ].sort();

    expect(Object.keys(RELAY_ROUTE_POLICIES).sort()).toEqual(expectedPaths);
  });

  it("uses only reviewed methods and capability classes", () => {
    for (const policy of Object.values(RELAY_ROUTE_POLICIES)) {
      expect(["GET", "POST"]).toContain(policy.method);
      expect(RELAY_ROUTE_CAPABILITIES).toContain(policy.capability);
    }
  });
});
