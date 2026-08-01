/**
 * Chọn adapter antidetect theo biến môi trường ANTIDETECT_PROVIDER.
 * Đổi nhà cung cấp = sửa một dòng trong .env, không đụng vào code.
 */
import type { AntidetectAdapter } from "./antidetect-browser-adapter";
import { AdsPowerAdapter } from "./adspower-adapter";
import { MultizenAdapter } from "./multizen-adapter";

export type AntidetectProvider = "multizen" | "adspower";

const DEFAULT_MULTIZEN_URL = "http://127.0.0.1:7777";
const DEFAULT_ADSPOWER_URL = "http://local.adspower.net:50325";

let cachedAdapter: AntidetectAdapter | null = null;

export function createAntidetectAdapter(): AntidetectAdapter {
  const provider = (process.env.ANTIDETECT_PROVIDER ?? "multizen").toLowerCase();

  switch (provider) {
    case "multizen":
      return new MultizenAdapter(
        process.env.MULTIZEN_MCP_URL ?? DEFAULT_MULTIZEN_URL,
        process.env.MULTIZEN_MCP_TOKEN,
      );
    case "adspower":
      return new AdsPowerAdapter(process.env.ADSPOWER_API_URL ?? DEFAULT_ADSPOWER_URL);
    default:
      throw new Error(
        `ANTIDETECT_PROVIDER="${provider}" không hợp lệ. Chỉ nhận "multizen" hoặc "adspower".`,
      );
  }
}

/** Adapter dùng chung, khởi tạo một lần. */
export function getAntidetectAdapter(): AntidetectAdapter {
  cachedAdapter ??= createAntidetectAdapter();
  return cachedAdapter;
}

/** Chỉ dùng trong test. */
export function resetAntidetectAdapter(): void {
  cachedAdapter = null;
}
