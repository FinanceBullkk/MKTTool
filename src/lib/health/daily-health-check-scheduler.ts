/**
 * Bộ lịch dò shadowban hằng ngày — chạy bên trong web app, khởi động từ `src/instrumentation.ts`.
 *
 * Vì sao không dùng cron của hãng: xem đầu `src/lib/schedule/daily-run-schedule.ts`.
 *
 * Nó **không tự dò**: nó gọi đúng `launchHealthCheckProcess()` mà nút *"Dò cả đàn"* gọi, tức vẫn
 * là `tsx scripts/run-health-check.ts` ở một tiến trình riêng. Một bản sao thứ hai của luồng dò
 * là một bản sao sẽ lệch — và lệch ở đây nghĩa là lượt tự động chạy khác lượt bấm tay, kiểu hỏng
 * chỉ lộ ra khi đang cần tin vào số liệu.
 *
 * ## Ba thứ nó cố ý KHÔNG làm
 *
 * 1. **Không đợi lượt dò xong.** Tiến trình con sống mười phút và tách hẳn; bộ lịch chỉ bắn rồi
 *    ghi sổ. Ai muốn biết lượt đó ra sao thì đọc bảng `HealthCheck` — chỗ vốn đã có câu trả lời.
 * 2. **Không tự thử lại.** Bắn hụt hôm nay thì tới mốc hẹn ngày mai mới bắn lại. Thử lại mỗi phút
 *    khi thiếu proxy quan sát viên chỉ tạo ra mười lăm tiếng log rác, còn thứ chặn thì vẫn cần
 *    một người sửa.
 * 3. **Không chạy khi thiếu biến `HEALTH_CHECK_DAILY_AT`.** Tắt là mặc định — xem
 *    `readDailyScheduleTime`.
 */
import { loadTeamTimezone } from "../format/team-timezone";
import { prisma } from "../db/prisma-client";
import { DAILY_HEALTH_CHECK_ENV, DAILY_HEALTH_CHECK_JOB_KEY } from "./daily-health-check-config";
import {
  DailyScheduleError,
  decideDailyRun,
  formatTimeOfDay,
  readDailyScheduleTime,
  type TimeOfDay,
} from "../schedule/daily-run-schedule";
import {
  claimScheduledRun,
  readScheduledJobRun,
  recordScheduledRunOutcome,
  type ScheduledJobRunRecord,
} from "../schedule/scheduled-job-run-store";
import { readHealthCheckLockStatus } from "./health-check-lock";
import { launchHealthCheckProcess } from "./health-check-process-launcher";

export { DAILY_HEALTH_CHECK_ENV, DAILY_HEALTH_CHECK_JOB_KEY };

/**
 * Nhịp kiểm tra. Một phút vì đó là độ chính xác `HH:MM` hứa hẹn — nhịp thưa hơn thì giờ hẹn
 * 09:00 thành "khoảng 09:00 tới 09:05", mà mỗi lượt kiểm chỉ là một lượt đọc theo khóa chính.
 */
export const TICK_INTERVAL_MS = 60_000;

export type DailyTickStatus =
  | "disabled"
  | "too-early"
  | "already-decided"
  | "lost-race"
  | "launched"
  | "skipped";

export interface DailyTickResult {
  status: DailyTickStatus;
  message: string;
}

/** Chỗ nối ra thế giới, tách ra để test được mà không sinh tiến trình thật. */
export interface DailyTickDeps {
  now?: Date;
  env?: Partial<Record<string, string>>;
  countActiveObserverProxies?: () => Promise<number>;
  launch?: () => { pid: number | null };
}

function countActiveObserverProxiesFromDb(): Promise<number> {
  return prisma.observerProxy.count({ where: { active: true } });
}

/**
 * Một nhịp kiểm tra. Ném lỗi khi giờ hẹn khai sai dạng — người gọi bắt và ghi log.
 */
export async function tickDailyHealthCheck(
  deps: DailyTickDeps = {},
): Promise<DailyTickResult> {
  const {
    now = new Date(),
    env = process.env,
    countActiveObserverProxies = countActiveObserverProxiesFromDb,
    launch = launchHealthCheckProcess,
  } = deps;

  const at = readDailyScheduleTime(env[DAILY_HEALTH_CHECK_ENV]);
  if (!at) {
    return { status: "disabled", message: `Lịch dò đang tắt (chưa khai ${DAILY_HEALTH_CHECK_ENV}).` };
  }

  const record = await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY);
  const decision = decideDailyRun({
    now,
    timeZone: loadTeamTimezone(),
    at,
    lastRunAt: record?.lastRunAt ?? null,
  });

  if (decision.verdict === "TOO_EARLY") return { status: "too-early", message: decision.reason };
  if (decision.verdict === "ALREADY_DECIDED") {
    return { status: "already-decided", message: decision.reason };
  }

  const claimed = await claimScheduledRun({
    key: DAILY_HEALTH_CHECK_JOB_KEY,
    scheduledFor: decision.scheduledFor,
    now,
  });
  if (!claimed) {
    // Một bản sao khác của app vừa giành lượt hôm nay. Không phải lỗi — đó là cơ chế hoạt động
    // đúng, và nó phải nói ra được thay vì im lặng, vì "lượt hôm nay đâu mất rồi" là câu hỏi tốn
    // thời gian nhất khi có nhiều bản chạy song song.
    return {
      status: "lost-race",
      message: "Một bản khác của app vừa giành lượt hôm nay.",
    };
  }

  const skip = await reasonToSkip(countActiveObserverProxies);
  if (skip) {
    await recordScheduledRunOutcome(DAILY_HEALTH_CHECK_JOB_KEY, "SKIPPED", skip);
    return { status: "skipped", message: skip };
  }

  const { pid } = launch();
  if (pid === null) {
    const detail = "Không sinh được tiến trình dò — xem log của máy chủ.";
    await recordScheduledRunOutcome(DAILY_HEALTH_CHECK_JOB_KEY, "SKIPPED", detail);
    return { status: "skipped", message: detail };
  }

  const launched = `Đã bắn lượt dò ở tiến trình ${pid}.`;
  await recordScheduledRunOutcome(DAILY_HEALTH_CHECK_JOB_KEY, "LAUNCHED", launched);
  return { status: "launched", message: launched };
}

/**
 * Lý do KHÔNG nên bắn, hoặc `null` khi cứ bắn được.
 *
 * Cả hai lý do đều phải kiểm TRƯỚC khi sinh tiến trình. Sinh một tiến trình chắc chắn chết ngay
 * dòng đầu là cách tệ nhất để báo lỗi ở đây: `stdio: "ignore"` nuốt sạch câu lỗi, nên sổ sẽ ghi
 * "đã bắn" trong khi thật ra không có gì chạy — đúng kiểu hỏng mà cả bộ dò sinh ra để diệt.
 */
async function reasonToSkip(
  countActiveObserverProxies: () => Promise<number>,
): Promise<string | null> {
  const running = await readHealthCheckLockStatus();
  if (running.running) {
    return (
      `Bỏ qua: đang có một lượt dò chạy dở (máy ${running.host}, tiến trình ${running.pid}, ` +
      `bắt đầu ${running.minutesElapsed} phút trước). Lượt đó đã đủ số liệu cho hôm nay.`
    );
  }

  if ((await countActiveObserverProxies()) === 0) {
    return (
      "Bỏ qua: chưa có proxy quan sát viên nào đang bật. Khai một cái ở trang Proxy — dò bằng " +
      "IP nhà hoặc bằng chính proxy của nick còn tệ hơn không dò."
    );
  }

  return null;
}

/** Giờ hẹn + lượt gần nhất, cho trang Sức khỏe. */
export interface DailyHealthCheckScheduleView {
  /** `null` nghĩa là lịch đang tắt. */
  at: TimeOfDay | null;
  /** Câu lỗi khi giờ hẹn khai sai dạng — hiện thẳng lên màn hình thay vì trông như đang tắt. */
  configError: string | null;
  lastRun: ScheduledJobRunRecord | null;
}

export async function readDailyHealthCheckSchedule(
  env: Partial<Record<string, string>> = process.env,
): Promise<DailyHealthCheckScheduleView> {
  let at: TimeOfDay | null = null;
  let configError: string | null = null;
  try {
    at = readDailyScheduleTime(env[DAILY_HEALTH_CHECK_ENV]);
  } catch (error) {
    configError = error instanceof Error ? error.message : String(error);
  }

  return { at, configError, lastRun: await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY) };
}

/** Chặn khởi động hai lần trong cùng một tiến trình — `register()` chỉ gọi một lần, nhưng nạp
 * lại module lúc dev thì không chắc, và hai bộ đếm giờ chồng nhau rất khó nhìn ra từ log. */
let running = false;

/**
 * Bật bộ lịch. Trả `null` khi không bật (tắt, hoặc giờ hẹn khai sai).
 *
 * Giờ hẹn sai dạng thì **ghi log rồi thôi**, không làm app chết: một lỗi gõ trong biến môi trường
 * không đáng đổi bằng cả web app ngừng phục vụ. Để nó không im lặng, khay cảnh báo vận hành có
 * một mục riêng cho đúng ca này.
 */
export function startDailyHealthCheckScheduler(): { stop: () => void } | null {
  if (running) return null;

  let at: TimeOfDay | null;
  try {
    at = readDailyScheduleTime(process.env[DAILY_HEALTH_CHECK_ENV]);
  } catch (error) {
    console.error(
      `[lịch dò] KHÔNG bật được: ${error instanceof DailyScheduleError ? error.message : error}`,
    );
    return null;
  }

  if (!at) {
    console.log(
      `[lịch dò] Đang tắt. Khai ${DAILY_HEALTH_CHECK_ENV}="09:00" để bộ dò tự chạy mỗi ngày.`,
    );
    return null;
  }

  running = true;
  console.log(
    `[lịch dò] Bật: ${formatTimeOfDay(at)} mỗi ngày theo ${loadTeamTimezone()}.`,
  );

  const tick = async () => {
    try {
      const result = await tickDailyHealthCheck();
      // Nhịp bình thường (chưa tới giờ / hôm nay quyết rồi) không ghi log: 1440 dòng mỗi ngày
      // là cách chôn vùi đúng dòng đáng đọc.
      if (result.status !== "too-early" && result.status !== "already-decided") {
        console.log(`[lịch dò] ${result.message}`);
      }
    } catch (error) {
      console.error("[lịch dò] Nhịp kiểm tra hỏng:", error);
    }
  };

  const timer = setInterval(() => void tick(), TICK_INTERVAL_MS);
  // Bộ đếm giờ không được là thứ giữ tiến trình sống — máy chủ HTTP mới là thứ đó.
  timer.unref();

  // Một nhịp ngay lúc khởi động, để lượt đã lỡ lúc app tắt được bắt kịp mà không phải chờ tới
  // phút tròn tiếp theo.
  void tick();

  return {
    stop: () => {
      clearInterval(timer);
      running = false;
    },
  };
}
