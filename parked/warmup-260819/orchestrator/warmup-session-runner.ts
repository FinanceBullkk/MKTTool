/**
 * TikTok Warmup Session Runner
 *
 * Điều phối toàn bộ quy trình của một phiên nuôi nick TikTok tự động:
 * 1. Khởi tạo quan sát Feed For You Page (FYP).
 * 2. Vòng lặp duyệt video và thực thi quyết định Markov.
 * 3. Thu thập dữ liệu đo lường (Telemetry) và báo cáo tiến độ thời gian thực.
 */

import { CdpStealthClient } from "../driver/cdp-stealth-client";
import { decideNextTikTokAction, type ProfileNicheConfig, type WarmupDecision } from "../markov/tiktok-markov-machine";
import type { TikTokVideoState } from "../markov/tiktok-video-observer";

export interface WarmupTelemetryProgress {
  profileId: string;
  currentVideoIndex: number;
  totalVideosTarget: number;
  videosWatched: number;
  likesGiven: number;
  commentsRead: number;
  elapsedSeconds: number;
  currentAction: string;
  currentVideoState?: TikTokVideoState;
  lastDecision?: WarmupDecision;
}

export interface WarmupSessionResult {
  profileId: string;
  ok: boolean;
  totalVideosProcessed: number;
  likesGiven: number;
  commentsExplored: number;
  totalDurationSeconds: number;
  logs: string[];
}

export async function runTikTokWarmupSession(
  profileId: string,
  cdpClient: CdpStealthClient,
  options?: {
    maxVideos?: number;
    maxDurationMinutes?: number;
    nicheConfig?: ProfileNicheConfig;
    onProgress?: (progress: WarmupTelemetryProgress) => void;
    abortSignal?: AbortSignal;
    skipDelays?: boolean; // Cho test hoặc fast mode
  },
): Promise<WarmupSessionResult> {
  const maxVideos = options?.maxVideos ?? 20;
  const maxDurationSeconds = (options?.maxDurationMinutes ?? 15) * 60;
  const startTime = Date.now();

  const logs: string[] = [];
  let videosWatched = 0;
  let likesGiven = 0;
  let commentsExplored = 0;

  const log = (msg: string) => {
    const timeStr = new Date().toLocaleTimeString("vi-VN");
    logs.push(`[${timeStr}] ${msg}`);
  };

  log(`🚀 Bắt đầu phiên nuôi tự động cho Profile [${profileId}] (Mục tiêu: ${maxVideos} videos / tối đa ${Math.round(maxDurationSeconds / 60)} phút)`);

  for (let index = 1; index <= maxVideos; index++) {
    if (options?.abortSignal?.aborted) {
      log("🛑 Phiên nuôi nhận tín hiệu dừng từ người dùng.");
      break;
    }

    const elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
    if (elapsedSeconds >= maxDurationSeconds) {
      log(`⏱️ Đã đạt giới hạn thời gian phiên (${Math.round(elapsedSeconds / 60)} phút). Kết thúc phiên nuôi.`);
      break;
    }

    // 1. Đọc trạng thái video hiện tại
    const videoState = await cdpClient.observeTikTokVideo();

    // 2. Ra quyết định Markov
    const decision = decideNextTikTokAction(videoState, options?.nicheConfig);

    log(`🎬 Video #${index}: [${videoState.author || "ẩn danh"}] - ${decision.reason}`);

    options?.onProgress?.({
      profileId,
      currentVideoIndex: index,
      totalVideosTarget: maxVideos,
      videosWatched,
      likesGiven,
      commentsRead: commentsExplored,
      elapsedSeconds,
      currentAction: decision.reason,
      currentVideoState: videoState,
      lastDecision: decision,
    });

    // 3. Xem video theo thời gian đã quyết định
    const watchMs = options?.skipDelays ? 10 : decision.watchDurationSeconds * 1000;
    const checkInterval = options?.skipDelays ? 10 : 1000;
    let waitedMs = 0;

    while (waitedMs < watchMs) {
      if (options?.abortSignal?.aborted) break;
      const sleepTime = Math.min(checkInterval, watchMs - waitedMs);
      await new Promise((r) => setTimeout(r, sleepTime));
      waitedMs += sleepTime;
    }

    // 4. Nếu quyết định thả tim -> thực hiện like
    if (decision.shouldLike) {
      try {
        log(`❤️ Thả tim cho video của @${videoState.author || "kênh"}`);
        await cdpClient.likeCurrentVideo();
        likesGiven++;
      } catch {
        // bỏ qua lỗi click like
      }
    }

    // 5. Nếu quyết định đọc comment -> mở và đọc
    if (decision.shouldOpenComments && decision.commentReadDurationSeconds > 0) {
      log(`💬 Mở đọc bình luận trong ${decision.commentReadDurationSeconds} giây...`);
      commentsExplored++;
      // Cuộn nhẹ để đọc
      await cdpClient.scrollMomentum(150, { intensity: "gentle" });
      if (!options?.skipDelays) {
        await new Promise((r) => setTimeout(r, decision.commentReadDurationSeconds * 1000));
      }
    }

    videosWatched++;

    // 6. Cuộn lướt sang video tiếp theo (khoảng cách 650px - 850px)
    const scrollDistance = Math.round(720 + (Math.random() - 0.5) * 80);
    const scrollIntensity = decision.action === "SKIP_FAST" ? "swipe" : "normal";
    await cdpClient.scrollMomentum(scrollDistance, { intensity: scrollIntensity });

    // 7. Nghỉ tự nhiên giữa 2 video (600ms - 1500ms)
    const pauseBetweenVideos = options?.skipDelays ? 5 : Math.round(600 + Math.random() * 900);
    await new Promise((r) => setTimeout(r, pauseBetweenVideos));
  }

  const totalDurationSeconds = Math.round((Date.now() - startTime) / 1000);
  log(`✅ Hoàn tất phiên nuôi: Đã xem ${videosWatched} video, thả ${likesGiven} tim trong ${Math.round(totalDurationSeconds / 60)} phút.`);

  return {
    profileId,
    ok: true,
    totalVideosProcessed: videosWatched,
    likesGiven,
    commentsExplored,
    totalDurationSeconds,
    logs,
  };
}
