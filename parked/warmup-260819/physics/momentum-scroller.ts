/**
 * Momentum Scrolling Physics Simulator
 *
 * Mô phỏng thao tác cuộn chuột/vuốt màn hình với quán tính vật lý:
 * 1. Gia tốc ban đầu mạnh khi ngón tay tác động lực.
 * 2. Giảm tốc theo hàm suy giảm số mũ (Exponential Friction Decay).
 * 3. Chia nhỏ thành các bước cuộn 60 FPS (~16ms/bước) để trình duyệt xử lý mượt mà.
 */

export interface ScrollStep {
  deltaY: number;
  delayMs: number;
}

export interface ScrollOptions {
  direction?: "down" | "up";
  intensity?: "gentle" | "normal" | "swipe";
}

/**
 * Sinh danh sách các bước cuộn chuột (deltaY kèm delayMs)
 * với tổng khoảng cách cuộn `targetDistance` (ví dụ 600px - 900px để chuyển sang video tiếp theo trên TikTok).
 */
export function generateMomentumScroll(
  targetDistance: number,
  options?: ScrollOptions,
): ScrollStep[] {
  const directionSign = options?.direction === "up" ? -1 : 1;
  const intensity = options?.intensity ?? "normal";

  // Số frame cuộn dựa trên cường độ
  // swipe: cuộn nhanh (12-18 frames, ~250ms)
  // normal: cuộn vừa phải (20-30 frames, ~400ms)
  // gentle: cuộn chậm để đọc comment (35-50 frames, ~700ms)
  let frameCount = 24;
  let friction = 0.88;

  if (intensity === "swipe") {
    frameCount = 14;
    friction = 0.82;
  } else if (intensity === "gentle") {
    frameCount = 40;
    friction = 0.92;
  }

  // Phân phối lực ban đầu sao cho tổng sum(deltaY) xấp xỉ targetDistance
  // Sử dụng chuỗi hình học: sum = initialDelta * (1 - friction^n) / (1 - friction)
  const denominator = (1 - Math.pow(friction, frameCount)) / (1 - friction);
  const initialDelta = targetDistance / denominator;

  const steps: ScrollStep[] = [];
  let currentDelta = initialDelta;
  let accumulated = 0;

  for (let i = 0; i < frameCount; i++) {
    // Thêm một lượng nhiễu nhỏ ngẫu nhiên +/- 5%
    const noise = 1 + (Math.random() - 0.5) * 0.1;
    const stepDelta = Math.round(currentDelta * noise * 10) / 10;

    accumulated += stepDelta;
    currentDelta *= friction;

    // Thời gian giữa các frame dao động quanh 16.6ms (60 FPS)
    const delayMs = Math.max(12, Math.min(22, Math.round(16.6 + (Math.random() - 0.5) * 4)));

    steps.push({
      deltaY: stepDelta * directionSign,
      delayMs,
    });
  }

  // Bù trừ phần chênh lệch nhỏ do làm tròn vào frame cuối
  const remainder = (targetDistance - accumulated) * directionSign;
  if (Math.abs(remainder) > 0.5 && steps.length > 0) {
    steps[steps.length - 1].deltaY += Math.round(remainder * 10) / 10;
  }

  return steps;
}
