/**
 * Đường karma 30 ngày, vẽ bằng SVG thuần.
 *
 * Không kéo recharts về chỉ để vẽ một đường gấp khúc: thư viện biểu đồ nặng hơn cả phần
 * còn lại của trang, và thứ cần đọc ở đây chỉ là "đường này đang lên, đứng, hay xuống".
 *
 * Karma ĐỨNG YÊN dù vẫn đăng đều là tín hiệu đáng lo ngang với karma tụt — bài vẫn lên
 * nhưng không ai thấy để mà vote. Vì vậy trục dọc không tự co về khoảng hẹp: một đường
 * phẳng phải trông ra phẳng, không được phóng to thành gợn sóng như đang có biến động.
 */
import { formatDayMonth } from "@/lib/format/vietnamese-date-format";

export interface KarmaPoint {
  at: Date;
  karma: number;
}

const WIDTH = 640;
const HEIGHT = 120;
const PADDING = { top: 8, right: 8, bottom: 18, left: 8 };

export function KarmaTrendChart({ points }: { points: KarmaPoint[] }) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-neutral-500">
        At least two successful karma readings are required to draw a trend.
        {points.length === 1 ? ` Current reading: ${points[0].karma} karma.` : ""}
      </p>
    );
  }

  const sorted = [...points].sort((left, right) => left.at.getTime() - right.at.getTime());
  const values = sorted.map((point) => point.karma);
  const min = Math.min(...values);
  const max = Math.max(...values);

  // Đường phẳng thì span = 0 và mọi điểm sẽ chia cho 0. Đẩy về giữa khung thay vì để NaN.
  const span = max - min;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const coords = sorted.map((point, index) => {
    const x = PADDING.left + (index / (sorted.length - 1)) * plotWidth;
    const y =
      span === 0
        ? PADDING.top + plotHeight / 2
        : PADDING.top + plotHeight - ((point.karma - min) / span) * plotHeight;
    return { x, y, ...point };
  });

  const line = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const change = last.karma - first.karma;

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Karma changed from ${first.karma} on ${formatDayMonth(first.at)} to ${last.karma} on ${formatDayMonth(last.at)}`}
      >
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-emerald-600 dark:text-emerald-400"
        />
        {coords.map((point) => (
          <circle
            key={point.at.toISOString()}
            cx={point.x}
            cy={point.y}
            r="2.5"
            className="fill-emerald-600 dark:fill-emerald-400"
          />
        ))}
        <text x={PADDING.left} y={HEIGHT - 4} className="fill-neutral-500 text-[10px]">
          {formatDayMonth(first.at)}
        </text>
        <text
          x={WIDTH - PADDING.right}
          y={HEIGHT - 4}
          textAnchor="end"
          className="fill-neutral-500 text-[10px]"
        >
          {formatDayMonth(last.at)}
        </text>
      </svg>

      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
        {first.karma} → {last.karma} karma ({change >= 0 ? "+" : ""}
        {change} across {sorted.length} checks).
        {change === 0
          ? " Karma is flat. If the nick is still posting regularly, its posts may not be reaching anyone."
          : ""}
      </p>
    </div>
  );
}
