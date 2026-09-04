import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { conciseAlertMessage, OpsAlertTrayClient } from "./ops-alert-tray-client";

describe("OpsAlertTrayClient", () => {
  it("keeps every alert visible while collapsing long guidance by default", () => {
    const markup = renderToStaticMarkup(
      createElement(OpsAlertTrayClient, {
        alerts: [
          {
            id: "vault-key",
            tone: "amber",
            message: "The server still holds the operator key. Move it to an operator machine.",
            action: "Remove the server copy after handoff.",
          },
          {
            id: "relay-revoked",
            tone: "red",
            message: "A Relay PC is revoked. Its local cleanup is still pending.",
            action: "Complete retirement on that PC.",
          },
        ],
      }),
    );

    expect(markup).toContain("The server still holds the operator key.");
    expect(markup).toContain("A Relay PC is revoked.");
    expect(markup).not.toContain("Move it to an operator machine.");
    expect(markup).not.toContain("Remove the server copy after handoff.");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Show details");
  });

  it("uses the full message when no sentence boundary exists", () => {
    expect(conciseAlertMessage("Relay needs attention")).toBe("Relay needs attention");
  });
});
