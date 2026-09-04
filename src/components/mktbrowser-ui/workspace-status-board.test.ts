import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceStatusBoard } from "./workspace-status-board";

const OFFLINE = {
  ready: false,
  state: "relay-offline",
  message: "Start Relay on this PC, then check again.",
  deviceId: null,
};

describe("WorkspaceStatusBoard", () => {
  it("does not show a setup remedy until the local check has finished", () => {
    const checking = renderToStaticMarkup(
      createElement(WorkspaceStatusBoard, {
        checking: true,
        counts: { all: 1, running: 0, warmup: 0, error: 0 },
        localReadiness: OFFLINE,
        onRefresh: () => undefined,
      }),
    );
    const checked = renderToStaticMarkup(
      createElement(WorkspaceStatusBoard, {
        checking: false,
        counts: { all: 1, running: 0, warmup: 0, error: 0 },
        localReadiness: OFFLINE,
        onRefresh: () => undefined,
      }),
    );

    expect(checking).toContain("Checking local browser profile conditions...");
    expect(checking).not.toContain('href="/setup"');
    expect(checked).toContain('href="/setup"');
  });
});
