/**
 * 2D Cubic Bézier Mouse Trajectory Generator
 *
 * Mô phỏng quỹ đạo chuyển động chuột của bàn tay người thật:
 * 1. Sinh 2 điểm kiểm soát (Control Points) ngẫu nhiên có độ lệch dựa trên khoảng cách.
 * 2. Áp dụng hàm gia tốc & giảm tốc tự nhiên (Ease-In, Ease-Out).
 * 3. Thêm nhiễu vi mô sinh trắc học (Micro-jitter) mô phỏng độ rung lắc tự nhiên của cơ tay.
 * 4. Tạo xác suất vượt điểm đích nhẹ (Overshoot) và tự động kéo chuột lại điểm mục tiêu.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface MouseMoveStep {
  x: number;
  y: number;
  delayMs: number;
}

/**
 * Tính toán điểm trên đường cong Bézier bậc 3 tại thời điểm t (0 <= t <= 1)
 */
export function calculateCubicBezierPoint(
  p0: Point2D,
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  t: number,
): Point2D {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const x = uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
  const y = uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

  return { x, y };
}

/**
 * Hàm phân phối Gaussian ngẫu nhiên (Box-Muller transform) để tạo độ rung lắc tự nhiên
 */
export function randomGaussian(mean = 0, stdev = 1): number {
  const u1 = 1 - Math.random();
  const u2 = 1 - Math.random();
  const randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
  return mean + stdev * randStdNormal;
}

/**
 * Hàm Ease-In-Out dạng Sigmoidal cho vận tốc di chuột
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/**
 * Sinh danh sách các bước di chuột (chuỗi tọa độ x, y kèm thời gian nghỉ delayMs)
 * từ điểm bắt đầu `start` tới điểm kết thúc `target`.
 */
export function generateBezierMouseTrajectory(
  start: Point2D,
  target: Point2D,
  options?: {
    speedMultiplier?: number;
    allowOvershoot?: boolean;
  },
): MouseMoveStep[] {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);

  if (distance < 2) {
    return [{ x: target.x, y: target.y, delayMs: 10 }];
  }

  // Số lượng điểm mẫu phụ thuộc vào khoảng cách di chuyển
  // Khoảng cách ngắn: ít điểm (10 - 20 điểm), khoảng cách xa: nhiều điểm (30 - 60 điểm)
  const stepsCount = Math.max(12, Math.min(60, Math.floor(distance / 15) + 10));

  // Tạo 2 điểm kiểm soát ngẫu nhiên lệch khỏi đường thẳng
  const spread = Math.min(distance * 0.4, 120);
  const p1: Point2D = {
    x: start.x + dx * 0.25 + randomGaussian(0, spread * 0.5),
    y: start.y + dy * 0.25 + randomGaussian(0, spread * 0.5),
  };
  const p2: Point2D = {
    x: start.x + dx * 0.75 + randomGaussian(0, spread * 0.3),
    y: start.y + dy * 0.75 + randomGaussian(0, spread * 0.3),
  };

  // Xác suất 15% vượt mục tiêu nhẹ (overshoot) rồi điều chỉnh lại
  const shouldOvershoot = options?.allowOvershoot ?? (Math.random() < 0.15 && distance > 100);
  const actualTarget: Point2D = shouldOvershoot
    ? {
        x: target.x + randomGaussian(dx * 0.05, 4),
        y: target.y + randomGaussian(dy * 0.05, 4),
      }
    : target;

  const trajectory: MouseMoveStep[] = [];

  for (let i = 0; i <= stepsCount; i++) {
    const rawT = i / stepsCount;
    const easedT = easeInOut(rawT);

    const point = calculateCubicBezierPoint(start, p1, p2, actualTarget, easedT);

    // Thêm micro-jitter nhỏ (chỉ rung nhẹ 0.3 - 0.8px ở giữa hành trình, không rung ở điểm bắt đầu và kết thúc)
    const jitterFactor = Math.sin(Math.PI * rawT);
    const jitterX = randomGaussian(0, 0.4 * jitterFactor);
    const jitterY = randomGaussian(0, 0.4 * jitterFactor);

    // Thời gian nghỉ giữa các frame (khoảng 8ms - 22ms, ~60fps)
    const baseDelay = 12 + randomGaussian(0, 3);
    const delayMs = Math.max(5, Math.min(30, Math.round(baseDelay * (options?.speedMultiplier ?? 1))));

    trajectory.push({
      x: Math.round((point.x + jitterX) * 10) / 10,
      y: Math.round((point.y + jitterY) * 10) / 10,
      delayMs,
    });
  }

  // Nếu có overshoot, thêm các bước hiệu chỉnh kéo về điểm target đích
  if (shouldOvershoot) {
    const correctionSteps = 4;
    const lastPoint = trajectory[trajectory.length - 1];
    for (let j = 1; j <= correctionSteps; j++) {
      const ct = j / correctionSteps;
      trajectory.push({
        x: Math.round((lastPoint.x + (target.x - lastPoint.x) * ct) * 10) / 10,
        y: Math.round((lastPoint.y + (target.y - lastPoint.y) * ct) * 10) / 10,
        delayMs: 14 + Math.round(Math.random() * 8),
      });
    }
  }

  // Đảm bảo điểm cuối cùng chính xác là target
  trajectory.push({
    x: target.x,
    y: target.y,
    delayMs: 20 + Math.round(Math.random() * 20),
  });

  return trajectory;
}
