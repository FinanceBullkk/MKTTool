import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-actor", () => ({ checkActor: vi.fn() }));
import { checkActor } from "@/lib/auth/require-actor";
import { proxy } from "./proxy";

describe("page access redirects", () => {
  beforeEach(() => vi.resetAllMocks());

  it("explains revoked access without copying account details into browser history", async () => {
    vi.mocked(checkActor).mockResolvedValue({
      ok: false, needsLogin: false, message: "Account removed@example.test is no longer allowed.",
    });
    const response = await proxy(new NextRequest("https://tool.example/accounts"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("EMAIL_NOT_ALLOWED");
    expect(location.searchParams.has("error_description")).toBe(false);
    expect(location.href).not.toContain("removed");
  });

  it("preserves the setup return path for signed-out operators", async () => {
    vi.mocked(checkActor).mockResolvedValue({ ok: false, needsLogin: true, message: "Sign in" });
    const response = await proxy(new NextRequest("https://tool.example/setup"));
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("callbackURL")).toBe("/setup");
    expect(location.searchParams.has("error")).toBe(false);
  });
});
