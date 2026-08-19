/**
 * CDP Stealth Driver Client
 *
 * Cung cấp tầng điều khiển cấp thấp qua giao thức Chrome DevTools Protocol (CDP)
 * đảm bảo mọi sự kiện chuột, bàn phím và cuộn trang đều có cờ `event.isTrusted === true`.
 */

import {
  generateBezierMouseTrajectory,
  type Point2D,
} from "../physics/bezier-curve";
import {
  generateMomentumScroll,
  type ScrollOptions,
} from "../physics/momentum-scroller";
import { generateNaturalTypingPlan } from "../physics/telex-typing";
import { TIKTOK_OBSERVER_DOM_SNIPPET, type TikTokVideoState } from "../markov/tiktok-video-observer";

export interface CdpSendFn {
  (method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export class CdpStealthClient {
  private currentMousePos: Point2D = { x: 500, y: 500 };

  constructor(private readonly cdpSend: CdpSendFn) {}

  /**
   * Thực thi JavaScript trên ngữ cảnh trang web và nhận kết quả
   */
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const res = (await this.cdpSend("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })) as { result?: { value?: unknown; description?: string } };

    return res?.result?.value as T;
  }

  /**
   * Đọc trạng thái Video Player TikTok hiện tại trên DOM
   */
  async observeTikTokVideo(): Promise<TikTokVideoState> {
    try {
      const state = await this.evaluate<TikTokVideoState>(TIKTOK_OBSERVER_DOM_SNIPPET);
      if (state && typeof state.duration === "number") {
        return state;
      }
    } catch {
      // Fallback
    }

    return {
      found: false,
      duration: 20,
      currentTime: 0,
      isPaused: false,
      isMuted: false,
      isLive: false,
      isSponsored: false,
      author: "",
      caption: "",
      hashtags: [],
      isLiked: false,
    };
  }

  /**
   * Di chuyển chuột từ vị trí hiện tại tới tọa độ đích theo đường cong Bézier 2D
   */
  async moveMouseSmooth(target: Point2D): Promise<void> {
    const trajectory = generateBezierMouseTrajectory(this.currentMousePos, target);

    for (const step of trajectory) {
      await this.cdpSend("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: step.x,
        y: step.y,
      });
      this.currentMousePos = { x: step.x, y: step.y };
      if (step.delayMs > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }
    }
  }

  /**
   * Di chuột tới điểm mục tiêu và click chuột trái
   */
  async clickPoint(target: Point2D): Promise<void> {
    await this.moveMouseSmooth(target);

    // Thời gian giữ chuột khi nhấn (40ms - 90ms)
    const pressDelay = Math.round(40 + Math.random() * 50);

    await this.cdpSend("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });

    await new Promise((r) => setTimeout(r, pressDelay));

    await this.cdpSend("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: target.x,
      y: target.y,
      button: "left",
      clickCount: 1,
    });
  }

  /**
   * Cuộn lướt trang có quán tính vật lý (Momentum Scrolling)
   */
  async scrollMomentum(distance: number, options?: ScrollOptions): Promise<void> {
    const steps = generateMomentumScroll(distance, options);

    for (const step of steps) {
      await this.cdpSend("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: this.currentMousePos.x,
        y: this.currentMousePos.y,
        deltaX: 0,
        deltaY: step.deltaY,
      });

      if (step.delayMs > 0) {
        await new Promise((r) => setTimeout(r, step.delayMs));
      }
    }
  }

  /**
   * Gõ văn bản với nhịp sinh học tự nhiên
   */
  async typeNatural(text: string): Promise<void> {
    const plan = generateNaturalTypingPlan(text);

    for (const action of plan) {
      if (action.delayBeforeMs > 0) {
        await new Promise((r) => setTimeout(r, action.delayBeforeMs));
      }

      if (action.type === "keydown") {
        await this.cdpSend("Input.dispatchKeyEvent", {
          type: "keyDown",
          text: action.key.length === 1 ? action.key : undefined,
          key: action.key,
        });
      } else {
        await this.cdpSend("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: action.key,
        });
      }
    }
  }

  /**
   * Thả tim video TikTok hiện tại (tìm tọa độ icon like hoặc double click trung tâm video)
   */
  async likeCurrentVideo(): Promise<void> {
    // 1. Tìm vị trí nút Like trên DOM
    const likeBtnPos = await this.evaluate<{ x: number; y: number } | null>(`
      (function() {
        const btn = document.querySelector('[data-e2e="like-icon"]') ||
                    document.querySelector('button[aria-label*="Like"]');
        if (btn) {
          const rect = btn.getBoundingClientRect();
          return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
        }
        return null;
      })()
    `);

    if (likeBtnPos && likeBtnPos.x > 0 && likeBtnPos.y > 0) {
      await this.clickPoint(likeBtnPos);
    } else {
      // Fallback: Double click vào tâm viewport của video
      const center = { x: Math.round(window.innerWidth / 2 || 500), y: Math.round(window.innerHeight / 2 || 400) };
      await this.moveMouseSmooth(center);
      await this.cdpSend("Input.dispatchMouseEvent", { type: "mousePressed", x: center.x, y: center.y, button: "left", clickCount: 1 });
      await this.cdpSend("Input.dispatchMouseEvent", { type: "mouseReleased", x: center.x, y: center.y, button: "left", clickCount: 1 });
      await new Promise((r) => setTimeout(r, 60));
      await this.cdpSend("Input.dispatchMouseEvent", { type: "mousePressed", x: center.x, y: center.y, button: "left", clickCount: 2 });
      await this.cdpSend("Input.dispatchMouseEvent", { type: "mouseReleased", x: center.x, y: center.y, button: "left", clickCount: 2 });
    }
  }
}
