/**
 * TikTok Markov Decision Machine
 *
 * Mô hình quyết định hành vi tiêu thụ nội dung dựa trên xích Markov và mức độ
 * tương đồng ngách (Niche Relevance).
 */

import type { TikTokVideoState } from "./tiktok-video-observer";

export type WarmupActionType =
  | "SKIP_FAST" // Bỏ qua nhanh (1 - 3.5s) cho Ads, Livestream hoặc video lạc ngách
  | "WATCH_PARTIAL" // Xem một phần video (10s - 25s hoặc 50-70% thời lượng)
  | "WATCH_FULL" // Xem hết 100% thời lượng video
  | "LOOP_AND_LIKE" // Xem hết + xem lại 1 lần + thả tim
  | "LIKE_AND_WATCH" // Thả tim ở giữa video + xem tiếp
  | "EXPLORE_COMMENTS"; // Mở tab bình luận, cuộn đọc 5-10s rồi đóng lại

export interface WarmupDecision {
  action: WarmupActionType;
  watchDurationSeconds: number;
  shouldLike: boolean;
  shouldOpenComments: boolean;
  commentReadDurationSeconds: number;
  reason: string;
}

export interface ProfileNicheConfig {
  keywords?: string[];
  hashtags?: string[];
  coldStartDay?: number; // Ngày nuôi thứ mấy (1 -> 14)
}

/**
 * Đánh giá mức độ phù hợp của video với ngách tài khoản (0.0 -> 1.0)
 */
export function calculateNicheScore(
  video: TikTokVideoState,
  config?: ProfileNicheConfig,
): number {
  if (!config || (!config.keywords?.length && !config.hashtags?.length)) {
    return 0.5; // Không cấu hình ngách cụ thể -> coi như độ match trung bình
  }

  const textToScan = `${video.caption} ${video.hashtags.join(" ")} ${video.author}`.toLowerCase();
  let matches = 0;
  let totalTargets = 0;

  if (config.keywords) {
    totalTargets += config.keywords.length;
    for (const kw of config.keywords) {
      if (textToScan.includes(kw.toLowerCase())) matches += 1.5;
    }
  }

  if (config.hashtags) {
    totalTargets += config.hashtags.length;
    for (const tag of config.hashtags) {
      const normalized = tag.startsWith("#") ? tag.toLowerCase() : `#${tag.toLowerCase()}`;
      if (video.hashtags.includes(normalized) || textToScan.includes(normalized)) {
        matches += 2.0;
      }
    }
  }

  if (totalTargets === 0) return 0.5;
  return Math.min(1.0, matches / Math.max(1, totalTargets * 0.5));
}

/**
 * Ra quyết định hành vi cho video hiện tại theo xác suất Markov
 */
export function decideNextTikTokAction(
  video: TikTokVideoState,
  nicheConfig?: ProfileNicheConfig,
  randomSeed = Math.random(),
): WarmupDecision {
  const duration = Math.max(5, video.duration || 20);

  // 1. Nếu là Livestream hoặc Video Quảng cáo / Shop -> Luôn SKIP nhanh (<3.5s)
  if (video.isLive) {
    return {
      action: "SKIP_FAST",
      watchDurationSeconds: Math.round(1.5 + Math.random() * 1.5),
      shouldLike: false,
      shouldOpenComments: false,
      commentReadDurationSeconds: 0,
      reason: "Bỏ qua Livestream để giữ đúng tệp feed",
    };
  }

  if (video.isSponsored) {
    return {
      action: "SKIP_FAST",
      watchDurationSeconds: Math.round(2.0 + Math.random() * 1.5),
      shouldLike: false,
      shouldOpenComments: false,
      commentReadDurationSeconds: 0,
      reason: "Bỏ qua Video Quảng cáo / Được tài trợ",
    };
  }

  // 2. Tính toán điểm ngách
  const nicheScore = calculateNicheScore(video, nicheConfig);
  const isInNiche = nicheScore >= 0.4;

  // 3. Phân phối xác suất Markov
  if (isInNiche) {
    // Đúng ngách: Tỷ lệ tương tác và giữ chân cao
    if (randomSeed < 0.15 && !video.isLiked) {
      // 15% Loop + Thả tim
      const watchTime = Math.min(60, duration * 1.6);
      return {
        action: "LOOP_AND_LIKE",
        watchDurationSeconds: Math.round(watchTime),
        shouldLike: true,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: `Video đúng ngách (${Math.round(nicheScore * 100)}% match) -> Xem lặp lại và thả tim`,
      };
    } else if (randomSeed < 0.35 && !video.isLiked) {
      // 20% Thả tim + xem hết
      return {
        action: "LIKE_AND_WATCH",
        watchDurationSeconds: Math.round(duration * 0.9),
        shouldLike: true,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: `Video đúng ngách (${Math.round(nicheScore * 100)}% match) -> Thả tim và xem tiếp`,
      };
    } else if (randomSeed < 0.50) {
      // 15% Xem hết 100%
      return {
        action: "WATCH_FULL",
        watchDurationSeconds: Math.round(duration),
        shouldLike: false,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: `Video đúng ngách (${Math.round(nicheScore * 100)}% match) -> Xem trọn vẹn 100%`,
      };
    } else if (randomSeed < 0.65) {
      // 15% Mở bình luận đọc
      const readSeconds = Math.round(4 + Math.random() * 6);
      return {
        action: "EXPLORE_COMMENTS",
        watchDurationSeconds: Math.min(30, Math.round(duration * 0.7)),
        shouldLike: false,
        shouldOpenComments: true,
        commentReadDurationSeconds: readSeconds,
        reason: `Video đúng ngách (${Math.round(nicheScore * 100)}% match) -> Mở xem bình luận ${readSeconds}s`,
      };
    } else {
      // 35% Xem một phần (12s - 25s)
      const partialTime = Math.min(duration * 0.7, Math.max(10, Math.round(12 + Math.random() * 12)));
      return {
        action: "WATCH_PARTIAL",
        watchDurationSeconds: Math.round(partialTime),
        shouldLike: false,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: `Video ngách -> Xem tự nhiên ${partialTime}s rồi lướt`,
      };
    }
  } else {
    // Khác ngách: Lướt qua nhanh để định hình thuật toán TikTok
    if (randomSeed < 0.75) {
      // 75% Skip nhanh dưới 4 giây
      const skipTime = Math.round(1.8 + Math.random() * 2.2);
      return {
        action: "SKIP_FAST",
        watchDurationSeconds: skipTime,
        shouldLike: false,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: "Video không đúng ngách mục tiêu -> Bỏ qua nhanh sau vài giây",
      };
    } else {
      // 25% Xem nhẹ 8 - 14 giây như người lướt ngẫu nhiên
      const watchTime = Math.min(15, Math.round(8 + Math.random() * 6));
      return {
        action: "WATCH_PARTIAL",
        watchDurationSeconds: watchTime,
        shouldLike: false,
        shouldOpenComments: false,
        commentReadDurationSeconds: 0,
        reason: `Lướt ngẫu nhiên ${watchTime}s trước khi chuyển tiếp`,
      };
    }
  }
}
