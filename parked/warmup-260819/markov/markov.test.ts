import { describe, expect, it } from "vitest";
import {
  calculateNicheScore,
  decideNextTikTokAction,
} from "./tiktok-markov-machine";
import type { TikTokVideoState } from "./tiktok-video-observer";

describe("TikTok Markov Decision Machine", () => {
  const baseVideo: TikTokVideoState = {
    found: true,
    duration: 30,
    currentTime: 2,
    isPaused: false,
    isMuted: false,
    isLive: false,
    isSponsored: false,
    author: "skincare_expert",
    caption: "Bí quyết trị mụn và dưỡng ẩm mùa hè #skincare #trimun #lamdep",
    hashtags: ["#skincare", "#trimun", "#lamdep"],
    isLiked: false,
  };

  it("calculates high niche score for matching hashtags & keywords", () => {
    const score = calculateNicheScore(baseVideo, {
      keywords: ["mụn", "dưỡng ẩm"],
      hashtags: ["#skincare", "#trimun"],
    });

    expect(score).toBeGreaterThanOrEqual(0.6);
  });

  it("calculates low niche score for completely unrelated content", () => {
    const unrelatedVideo: TikTokVideoState = {
      ...baseVideo,
      caption: "Cách sửa xe máy Dream tại nhà #xemay #phutung",
      hashtags: ["#xemay", "#phutung"],
    };

    const score = calculateNicheScore(unrelatedVideo, {
      keywords: ["mỹ phẩm", "son môi"],
      hashtags: ["#skincare"],
    });

    expect(score).toBeLessThan(0.4);
  });

  it("always decides to SKIP_FAST for Livestreams", () => {
    const liveVideo: TikTokVideoState = {
      ...baseVideo,
      isLive: true,
    };

    const decision = decideNextTikTokAction(liveVideo);
    expect(decision.action).toBe("SKIP_FAST");
    expect(decision.watchDurationSeconds).toBeLessThanOrEqual(4);
    expect(decision.shouldLike).toBe(false);
  });

  it("always decides to SKIP_FAST for Sponsored Ads", () => {
    const adVideo: TikTokVideoState = {
      ...baseVideo,
      isSponsored: true,
    };

    const decision = decideNextTikTokAction(adVideo);
    expect(decision.action).toBe("SKIP_FAST");
    expect(decision.shouldLike).toBe(false);
  });

  it("decides to like or loop when in-niche and seed favors engagement", () => {
    const decision = decideNextTikTokAction(
      baseVideo,
      { keywords: ["mụn"], hashtags: ["#skincare"] },
      0.05, // low seed -> trigger like / loop
    );

    expect(decision.shouldLike).toBe(true);
    expect(decision.watchDurationSeconds).toBeGreaterThan(15);
  });
});
