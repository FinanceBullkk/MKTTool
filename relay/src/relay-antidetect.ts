/**
 * Đường xuống MultiZen trên **cùng chiếc máy này**.
 *
 * ## Vì sao cầu nối dựng adapter riêng, không dùng `antidetect-adapter-factory`
 *
 * Factory bên web app đọc `process.env` — nó sống trong một tiến trình có file `.env`. Cầu nối
 * thì không: cấu hình của nó nằm trong `relay-config.json` cạnh `.exe`. Kéo factory sang đây là
 * kéo theo giả định "có biến môi trường", và nó sẽ im lặng dùng giá trị mặc định thay vì nói ra
 * là chưa cấu hình.
 *
 * ## Vì sao MultiZen là tùy chọn, không phải cấu hình bắt buộc
 *
 * Cầu nối làm ba việc, chỉ **một** cần MultiZen (mở profile). Máy chỉ dùng để lấy mật khẩu và
 * OTP vẫn phải chạy được đầy đủ. Nên thiếu token không chặn khởi động — nó chỉ làm đúng nút
 * "Mở profile" trả về một câu nói rõ thiếu gì.
 */
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { MultizenAdapter } from "../../src/lib/antidetect/multizen-adapter";
import type { RelayConfig } from "./relay-config";

/** MultiZen chỉ công bố địa chỉ này; giữ khai được để còn dựng thử. */
export const DEFAULT_MULTIZEN_URL = "http://127.0.0.1:7777";

/** Bao lâu thì hỏi lại MultiZen. Đủ ngắn để trang trạng thái không nói dối quá một phút. */
const PROBE_TTL_MS = 30_000;

export class AntidetectNotConfiguredError extends Error {
  constructor() {
    super(
      'Cầu nối chưa có token MultiZen. Mở MultiZen → MCP → "Connect an agent" để lấy token, ' +
        'rồi thêm "multizenToken" vào relay-config.json và khởi động lại cầu nối.',
    );
    this.name = "AntidetectNotConfiguredError";
  }
}

/**
 * Adapter dùng chung cho cả tiến trình, dựng trễ.
 *
 * Dựng trễ vì `MultizenAdapter` bắt tay MCP ở lời gọi đầu tiên, và cầu nối khởi động lúc bật
 * máy — sớm hơn MultiZen. Dựng ngay lúc khởi động là bắt tay vào lúc chắc chắn hỏng, rồi ghi
 * nhớ trạng thái hỏng đó.
 */
export class RelayAntidetect {
  private adapter: AntidetectAdapter | null = null;
  private probe: { at: number; ready: boolean } | null = null;

  constructor(private readonly config: RelayConfig | null) {}

  /** `null` khi chưa cấu hình được — chỗ gọi tự quyết nói câu gì. */
  private get token(): string | null {
    return this.config?.multizenToken ?? null;
  }

  /** Adapter đã sẵn sàng, hoặc ném lỗi nói rõ thiếu gì. */
  getAdapter(): AntidetectAdapter {
    const token = this.token;
    if (!this.config || !token) throw new AntidetectNotConfiguredError();

    this.adapter ??= new MultizenAdapter(this.config.multizenUrl ?? DEFAULT_MULTIZEN_URL, token);
    return this.adapter;
  }

  /**
   * MultiZen có đang mở và nhận lệnh không.
   *
   * Kết quả nhớ trong `PROBE_TTL_MS` vì `/health` bị gọi ở **mọi cú bấm** trên web (ràng buộc 1
   * của spike GĐ0 — `pingRelay()` chạy trước mọi thứ khác). Hỏi MultiZen mỗi lần là cộng một
   * vòng bắt tay MCP vào độ trễ của từng cú bấm, đổi lấy độ tươi mà không ai cần: MultiZen
   * không tự tắt giữa hai cú bấm cách nhau vài giây.
   */
  async isReady(now: number = Date.now()): Promise<boolean> {
    if (!this.token) return false;
    if (this.probe && now - this.probe.at < PROBE_TTL_MS) return this.probe.ready;

    let ready = false;
    try {
      ready = await this.getAdapter().isAvailable();
    } catch {
      // `isAvailable` vốn không nên ném, nhưng nó đi qua mạng và qua một adapter. Mọi đường
      // hỏng đều là "chưa sẵn sàng" — đừng để một lỗi ở đây làm đổ cả `/health`, vì `/health`
      // chính là thứ web app dùng để nói "cầu nối còn sống không".
      ready = false;
    }

    this.probe = { at: now, ready };
    return ready;
  }

  /**
   * Kết quả lần hỏi gần nhất, `null` nếu chưa hỏi lần nào.
   *
   * Cho trang trạng thái — nó dựng HTML đồng bộ nên không đợi được một vòng MCP. `null` ở đó
   * hiện thành *"chưa kiểm"*, chứ không hiện thành *"không nối được"*: hai câu đó dẫn người
   * đọc đi hai hướng khác hẳn nhau, và đoán bừa là đẩy họ đi sai hướng.
   */
  lastProbe(): boolean | null {
    return this.probe?.ready ?? null;
  }

  /** Quên kết quả đã nhớ — gọi sau một lần mở profile hỏng, để lần hỏi sau nói đúng hiện trạng. */
  forgetProbe(): void {
    this.probe = null;
  }
}
