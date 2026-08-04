/**
 * Ghép ba mảnh lại: hỏi IP ra (`proxy-exit-ip-probe`), kết luận (`proxy-liveness-verdict`),
 * rồi ghi kết quả vào database để giao diện đọc được mà không phải gọi mạng lúc render.
 *
 * Nhận thẳng bản ghi proxy thay vì id, vì `launch/route.ts` đã có sẵn bản ghi trong tay —
 * bắt nó truy vấn lần nữa chỉ để kiểm là thêm một lượt đọc cho mỗi lần mở profile.
 */
import { decryptCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import {
  type ProbeOutcome,
  probeDirectExitIp,
  probeExitIpThroughProxy,
} from "./proxy-exit-ip-probe";
import { type ProxyLiveness, evaluateProxyLiveness } from "./proxy-liveness-verdict";

export interface ProxyRecordForCheck {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
  protocol: string;
  country: string;
}

/**
 * IP nhà đổi rất chậm, mà kiểm cả mẻ 8 proxy thì hỏi 8 lần là thừa 7.
 * TTL ngắn để đổi mạng (rút wifi, bật VPN) vẫn được nhận ra trong vòng một phút.
 */
const DIRECT_PROBE_CACHE_MS = 60_000;
let directProbeCache: { at: number; outcome: ProbeOutcome } | null = null;

async function directExitIp(): Promise<ProbeOutcome> {
  if (directProbeCache && Date.now() - directProbeCache.at < DIRECT_PROBE_CACHE_MS) {
    return directProbeCache.outcome;
  }
  const outcome = await probeDirectExitIp();
  directProbeCache = { at: Date.now(), outcome };
  return outcome;
}

/**
 * Đo một proxy. KHÔNG ghi database — bên gọi quyết định ghi vào bảng nào.
 *
 * Tách khỏi phần ghi vì có hai loại proxy ở hai bảng khác nhau (`Proxy` của nick và
 * `ObserverProxy` của bộ dò) mà phép đo thì y hệt. Chép phép đo ra hai bản là hai chỗ để
 * lệch nhau, và lệch ở đây nghĩa là cùng một proxy cho hai kết luận khác nhau tùy đường vào.
 *
 * Không bao giờ ném lỗi: mọi hỏng hóc đều thành một kết luận.
 */
export async function measureProxyLiveness(proxy: ProxyRecordForCheck): Promise<ProxyLiveness> {
  let password: string;
  try {
    password = decryptCredential(proxy.passwordEnc);
  } catch {
    // Giải mã hỏng là chuyện của VAULT_KEY, không phải của proxy — không được kết luận "chết".
    return {
      verdict: "UNKNOWN",
      message:
        "Không giải mã được mật khẩu proxy (VAULT_KEY đã đổi?). Chưa kiểm được proxy còn sống không.",
      exitIp: null,
      blocksLaunch: false,
    };
  }

  const direct = await directExitIp();
  const throughProxy = await probeExitIpThroughProxy({
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password,
    protocol: proxy.protocol?.toLowerCase() ?? "http",
  });

  return evaluateProxyLiveness({ throughProxy, direct, declaredCountry: proxy.country });
}

/** Bốn cột kết quả, giống hệt nhau ở cả hai bảng. */
function checkColumns(liveness: ProxyLiveness) {
  return {
    lastCheckedAt: new Date(),
    lastCheckVerdict: liveness.verdict,
    lastCheckDetail: liveness.message.slice(0, 500),
    lastExitIp: liveness.exitIp,
  };
}

/** Đo một proxy của nick rồi ghi kết quả. */
export async function checkProxyLiveness(proxy: ProxyRecordForCheck): Promise<ProxyLiveness> {
  const liveness = await measureProxyLiveness(proxy);
  await prisma.proxy.update({ where: { id: proxy.id }, data: checkColumns(liveness) });
  return liveness;
}

/**
 * Đo proxy quan sát viên rồi ghi kết quả.
 *
 * Đặt cạnh hàm trên có chủ ý: hai đường ghi phải nhìn thấy nhau. Nhưng hậu quả khi hỏng thì
 * KHÁC HẲN — proxy của nick chết là mất một nick, proxy quan sát viên chết là mù cả đàn, vì
 * mọi kết luận shadowban đều nhìn qua đúng một IP này.
 */
export async function checkObserverProxyLiveness(
  proxy: ProxyRecordForCheck,
): Promise<ProxyLiveness> {
  const liveness = await measureProxyLiveness(proxy);
  await prisma.observerProxy.update({ where: { id: proxy.id }, data: checkColumns(liveness) });
  return liveness;
}

export interface ProxyCheckSummary {
  label: string;
  liveness: ProxyLiveness;
}

/**
 * Kiểm cả kho.
 *
 * Lấy IP nhà TRƯỚC rồi mới bắn cả mẻ, để tám lượt kiểm dùng chung một mốc so thay vì
 * mỗi lượt tự đi hỏi ipinfo.io một lần.
 */
export async function checkAllProxies(): Promise<ProxyCheckSummary[]> {
  const proxies = await prisma.proxy.findMany({ orderBy: { label: "asc" } });
  if (proxies.length === 0) return [];

  await directExitIp();

  return Promise.all(
    proxies.map(async (proxy) => ({
      label: proxy.label,
      liveness: await checkProxyLiveness(proxy),
    })),
  );
}

/** Câu tổng kết cho một mẻ kiểm — gom theo kết luận để đọc được trong một dòng. */
export function summarizeProxyChecks(results: ProxyCheckSummary[]): string {
  if (results.length === 0) return "Chưa có proxy nào để kiểm.";

  const problems = results.filter((result) => result.liveness.verdict !== "OK");
  if (problems.length === 0) {
    return `Kiểm ${results.length} proxy — tất cả đều sống và đổi IP đúng.`;
  }

  const detail = problems
    .map((result) => `${result.label}: ${result.liveness.message}`)
    .join(" · ");
  return `Kiểm ${results.length} proxy, ${problems.length} có vấn đề. ${detail}`;
}
