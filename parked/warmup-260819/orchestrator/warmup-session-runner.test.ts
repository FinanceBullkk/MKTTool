import { describe, expect, it, vi } from "vitest";
import { runTikTokWarmupSession } from "./warmup-session-runner";
import { CdpStealthClient } from "../driver/cdp-stealth-client";

describe("TikTok Warmup Session Runner", () => {
  it("executes a full warmup session with mock CDP dispatch", async () => {
    const dispatchedMethods: string[] = [];

    const mockCdpSend = vi.fn(async (method: string, params?: Record<string, unknown>) => {
      dispatchedMethods.push(method);

      if (method === "Runtime.evaluate") {
        // Mock TikTok Video Observer response
        return {
          result: {
            value: {
              found: true,
              duration: 25,
              currentTime: 1,
              isPaused: false,
              isMuted: false,
              isLive: false,
              isSponsored: false,
              author: "review_cosmetics",
              caption: "Review kem chống nắng kiềm dầu #skincare #review",
              hashtags: ["#skincare", "#review"],
              isLiked: false,
            },
          },
        };
      }

      return {};
    });

    const cdpClient = new CdpStealthClient(mockCdpSend);

    const result = await runTikTokWarmupSession("profile-123", cdpClient, {
      maxVideos: 2, // run 2 videos quickly
      maxDurationMinutes: 1,
      nicheConfig: { keywords: ["skincare"] },
      skipDelays: true,
    });

    expect(result.ok).toBe(true);
    expect(result.totalVideosProcessed).toBe(2);
    expect(result.logs.length).toBeGreaterThan(0);

    // Kiểm tra các lệnh CDP được gửi
    expect(dispatchedMethods).toContain("Runtime.evaluate");
    expect(dispatchedMethods).toContain("Input.dispatchMouseEvent");
  });
});
