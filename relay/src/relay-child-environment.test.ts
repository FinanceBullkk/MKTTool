import { describe, expect, it } from "vitest";
import {
  NODE_TLS_ENVIRONMENT_KEYS,
  relayChildEnvironment,
} from "./relay-child-environment";

describe("Relay child environment", () => {
  it("removes inherited Node TLS overrides while preserving required child values", () => {
    const inherited = {
      PATH: "fixture-path",
      PRESERVE_ME: "fixture-value",
      NODE_OPTIONS: "--require=unsafe",
      NODE_EXTRA_CA_CERTS: "C:\\fixture-ca.pem",
      NODE_USE_SYSTEM_CA: "1",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
      node_options: "--require=unsafe-lowercase",
      Node_Extra_Ca_Certs: "C:\\fixture-ca-lowercase.pem",
      node_use_system_ca: "1",
      node_tls_reject_unauthorized: "0",
    };

    const environment = relayChildEnvironment(
      { RELAY_HOME: "C:\\Relay", node_tls_reject_unauthorized: "0" },
      inherited,
    );

    expect(environment).toMatchObject({
      PATH: "fixture-path",
      PRESERVE_ME: "fixture-value",
      RELAY_HOME: "C:\\Relay",
    });
    for (const key of NODE_TLS_ENVIRONMENT_KEYS) expect(environment[key]).toBeUndefined();
    expect(
      Object.keys(environment).some((key) =>
        NODE_TLS_ENVIRONMENT_KEYS.includes(key.toUpperCase() as (typeof NODE_TLS_ENVIRONMENT_KEYS)[number]),
      ),
    ).toBe(false);
    expect(inherited.NODE_TLS_REJECT_UNAUTHORIZED).toBe("0");
  });
});
