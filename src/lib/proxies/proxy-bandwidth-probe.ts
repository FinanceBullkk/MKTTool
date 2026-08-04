/**
 * Đo băng thông thật của một proxy: tải một file thử qua đúng proxy đó rồi đếm byte / thời gian.
 *
 * BA ĐIỀU PHẢI NHỚ TRƯỚC KHI ĐỌC SỐ ĐO
 *
 * 1. **Tốn quota trả tiền.** Proxy dân cư/mobile tính tiền theo GB. Mỗi lượt đo tiêu đúng
 *    `budgetBytes` (mặc định 1 MB) của proxy đó. Vì vậy phép đo này KHÔNG nằm trong nút
 *    "kiểm tất cả proxy" — chỉ chạy khi người dùng bấm tay từng cái, và số MB đã tiêu luôn
 *    hiện ra trong câu kết quả.
 * 2. **Đây là tốc độ TẢI XUỐNG.** Đăng bài kèm ảnh/video thì thứ quyết định là tốc độ tải lên,
 *    mà hai chiều có thể lệch nhau rất xa trên proxy dân cư.
 * 3. **Số đo là `min(mạng nhà, proxy, máy chủ thử)`.** Đo lúc mạng nhà đang tải thứ khác thì
 *    proxy tốt vẫn ra số xấu. So tương đối giữa các proxy đo cùng lúc thì đáng tin; so với một
 *    ngưỡng tuyệt đối thì không.
 */
import net from "node:net";
import {
  type HttpTransport,
  ProxyProbeError,
  buildRequestHead,
  parseHttpStatus,
  type ProxyEndpoint,
  proxyFaultForStatus,
  proxyTransport,
  toProbeFailure,
} from "./proxy-http-transport";
import { SPEED_TEST_SOURCES, type SpeedTestSource } from "./proxy-speed-test-sources";

const DOWNLOAD_PORT = 80;

/** Ngân sách mặc định: 1 MB mỗi lượt đo. Đủ để vượt giai đoạn khởi động TCP mà vẫn rẻ. */
export const DEFAULT_BUDGET_BYTES = 1_048_576;

/**
 * Cắt kết nối sau ngần này dù chưa tải đủ — proxy 100 kbps mà chờ đủ 1 MB là 80 giây treo
 * giao diện. Dừng sớm vẫn tính ra tốc độ đúng, chỉ là dựa trên ít byte hơn.
 */
export const DEFAULT_TIME_CAP_MS = 8_000;

/** Không nhận được byte nào trong ngần này thì coi như proxy đã treo. */
const STALL_TIMEOUT_MS = 10_000;

/**
 * Bỏ 128 KB đầu ra khỏi phép tính.
 *
 * TCP khởi động chậm (slow start): vài vòng RTT đầu cửa sổ còn nhỏ nên tốc độ đo được thấp hơn
 * hẳn tốc độ thật, và càng xa (proxy US, RTT 200 ms) càng lệch. Tính từ sau khởi động cho ra
 * con số gần với thứ trình duyệt thực sự nhận được.
 */
const WARMUP_BYTES = 131_072;

/** Cửa sổ sau khởi động phải đủ lớn thì mới dùng, không thì đo cả phần thân cho chắc. */
const MIN_WARM_BYTES = 65_536;
const MIN_WARM_MS = 50;

/** Phần đầu HTTP dài quá mức này là bên kia đang trả về thứ không phải HTTP. */
const MAX_HEADER_BYTES = 16_384;

export interface BandwidthBudget {
  budgetBytes: number;
  timeCapMs: number;
}

export const DEFAULT_BUDGET: BandwidthBudget = {
  budgetBytes: DEFAULT_BUDGET_BYTES,
  timeCapMs: DEFAULT_TIME_CAP_MS,
};

export interface BandwidthReading {
  /** Megabit/giây, tính trên cửa sổ sau khởi động. */
  mbps: number;
  /** Tổng byte đã tải về — đây chính là số quota đã tiêu của proxy. */
  bytes: number;
  /** Từ lúc gửi request tới byte đầu tiên. Độ trễ, không phải băng thông. */
  ttfbMs: number;
  /** Đã chạm trần thời gian, tức proxy chậm tới mức không tải xong ngân sách. */
  hitTimeCap: boolean;
  source: string;
}

export type BandwidthOutcome =
  | { kind: "ok"; reading: BandwidthReading }
  /** Proxy hỏng → được phép kết luận proxy có vấn đề. */
  | { kind: "unreachable"; detail: string }
  /** Bộ đo hoặc máy chủ thử hỏng → KHÔNG ĐO ĐƯỢC, không được đổ cho proxy. */
  | { kind: "probe-failed"; detail: string };

interface RawDownload {
  ttfbMs: number;
  bodyBytes: number;
  measuredBytes: number;
  measuredMs: number;
  hitTimeCap: boolean;
}

/**
 * Tải file thử qua một đường đã mở sẵn, đếm byte theo thời gian.
 *
 * Không gom phần thân vào bộ nhớ — chỉ cộng độ dài từng khối rồi vứt. Đo 1 MB thì không sao,
 * nhưng gom lại là mở đường cho một lần ai đó nâng ngân sách lên 100 MB làm treo máy.
 */
function downloadThroughTransport(
  transport: HttpTransport,
  source: SpeedTestSource,
  budget: BandwidthBudget,
): Promise<RawDownload> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let socket: net.Socket | null = null;
    let capTimer: ReturnType<typeof setTimeout> | null = null;

    let head = Buffer.alloc(0);
    let headerDone = false;
    let bodyBytes = 0;
    let sentAt = 0;
    let firstByteAt = 0;
    let bodyStartedAt = 0;
    let warmStartedAt = 0;
    let warmStartBytes = 0;

    function cleanup() {
      if (capTimer) clearTimeout(capTimer);
      capTimer = null;
      socket?.destroy();
    }

    function fail(error: ProxyProbeError) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    }

    function finish(hitTimeCap: boolean) {
      if (settled) return;
      settled = true;
      const endedAt = Date.now();
      cleanup();

      if (!headerDone || bodyBytes === 0) {
        // `settled` đã bật ở trên nên gọi thẳng `reject`, không đi qua `fail`.
        reject(
          new ProxyProbeError(
            hitTimeCap
              ? `quá ${budget.timeCapMs / 1000} giây mà chưa nhận được dữ liệu nào`
              : "kết nối đóng trước khi nhận được dữ liệu",
            "unreachable",
          ),
        );
        return;
      }

      // Cửa sổ sau khởi động chỉ dùng khi nó đủ dài để có ý nghĩa; proxy quá chậm (chưa qua nổi
      // 128 KB trong ngần ấy giây) thì đo cả phần thân, chấp nhận số thấp hơn thực tế.
      const warmBytes = bodyBytes - warmStartBytes;
      const warmMs = endedAt - warmStartedAt;
      const useWarm = warmStartedAt > 0 && warmBytes >= MIN_WARM_BYTES && warmMs >= MIN_WARM_MS;

      resolve({
        ttfbMs: firstByteAt - sentAt,
        bodyBytes,
        measuredBytes: useWarm ? warmBytes : bodyBytes,
        // Sàn 1 ms: chia cho 0 cho ra Infinity, mà `Infinity Mbps` thì ghi vào database được
        // nhưng đọc ra thì vô nghĩa.
        measuredMs: Math.max(useWarm ? warmMs : endedAt - bodyStartedAt, 1),
        hitTimeCap,
      });
    }

    /** Tách phần đầu HTTP ra khỏi khối đầu tiên; trả về số byte thân nằm lẫn trong đó. */
    function consumeHeader(chunk: Buffer): number {
      head = Buffer.concat([head, chunk]);
      const separator = head.indexOf("\r\n\r\n");
      if (separator === -1) {
        if (head.length > MAX_HEADER_BYTES) {
          fail(new ProxyProbeError("phản hồi không đúng định dạng HTTP", "probe-failed"));
        }
        return -1;
      }

      const status = parseHttpStatus(head.subarray(0, separator).toString("latin1"));
      if (status !== 200) {
        const proxyFault = proxyFaultForStatus(status);
        fail(
          proxyFault
            ? new ProxyProbeError(proxyFault, "unreachable")
            : // 403/429 hay gặp: máy chủ thử chặn dải IP datacenter. Lỗi của NHÀ CUNG CẤP,
              // không phải của proxy — đổi nhà, tuyệt đối không kết luận proxy chậm.
              new ProxyProbeError(`${source.host} trả về HTTP ${status || "?"}`, "probe-failed"),
        );
        return -1;
      }

      headerDone = true;
      const leftover = head.length - (separator + 4);
      head = Buffer.alloc(0);
      return leftover;
    }

    function onData(chunk: Buffer) {
      if (settled) return;
      if (firstByteAt === 0) firstByteAt = Date.now();

      let bodyChunkLength = chunk.length;
      if (!headerDone) {
        bodyChunkLength = consumeHeader(chunk);
        if (bodyChunkLength < 0) return;
        bodyStartedAt = Date.now();
      }

      bodyBytes += bodyChunkLength;
      if (warmStartedAt === 0 && bodyBytes >= WARMUP_BYTES) {
        warmStartedAt = Date.now();
        warmStartBytes = bodyBytes;
      }
      if (bodyBytes >= budget.budgetBytes) finish(false);
    }

    transport
      .open(source.host, DOWNLOAD_PORT)
      .then((opened) => {
        if (settled) {
          opened.destroy();
          return;
        }
        socket = opened;
        socket.setTimeout(STALL_TIMEOUT_MS);
        socket.on("data", onData);
        socket.once("end", () => finish(false));
        socket.once("timeout", () =>
          fail(
            new ProxyProbeError(
              `quá ${STALL_TIMEOUT_MS / 1000} giây proxy không gửi thêm dữ liệu`,
              "unreachable",
            ),
          ),
        );
        socket.once("error", (error: Error) =>
          fail(new ProxyProbeError(`đứt kết nối khi đang tải (${error.message})`, "unreachable")),
        );

        capTimer = setTimeout(() => finish(true), budget.timeCapMs);
        sentAt = Date.now();
        socket.write(
          buildRequestHead(transport, source.host, source.path(budget.budgetBytes), ["Accept: */*"]),
        );
      })
      .catch((error: unknown) => {
        const failure = toProbeFailure(error);
        fail(new ProxyProbeError(failure.detail, failure.kind));
      });
  });
}

function toReading(raw: RawDownload, source: SpeedTestSource): BandwidthReading {
  return {
    mbps: (raw.measuredBytes * 8) / (raw.measuredMs / 1000) / 1_000_000,
    bytes: raw.bodyBytes,
    ttfbMs: raw.ttfbMs,
    hitTimeCap: raw.hitTimeCap,
    source: source.host,
  };
}

/**
 * Đo băng thông tải xuống qua proxy. Không bao giờ ném lỗi — mọi hỏng hóc thành một kết quả.
 *
 * Hỏng ở tầng PROXY thì dừng ngay, không thử nhà kế tiếp: đổi máy chủ thử không cứu được một
 * proxy đã chết, mà thử tiếp thì tiêu thêm quota cho một câu trả lời đã biết trước.
 */
export async function measureProxyBandwidth(
  proxy: ProxyEndpoint,
  budget: BandwidthBudget = DEFAULT_BUDGET,
): Promise<BandwidthOutcome> {
  const transport = proxyTransport(proxy, STALL_TIMEOUT_MS);
  const failures: string[] = [];

  for (const source of SPEED_TEST_SOURCES) {
    try {
      return { kind: "ok", reading: toReading(await downloadThroughTransport(transport, source, budget), source) };
    } catch (error) {
      const failure = toProbeFailure(error);
      if (failure.kind === "unreachable") return failure;
      failures.push(failure.detail);
    }
  }

  return { kind: "probe-failed", detail: failures.join("; ") };
}
