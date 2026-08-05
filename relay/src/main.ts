/**
 * Điểm vào của cầu nối.
 *
 * Thứ tự khởi động, và lý do nó là thứ tự này:
 *
 *   1. Xác định thư mục dữ liệu
 *   2. **Đọc hoặc sinh cặp khóa của máy** — trước cấu hình, vì máy chưa có khóa thì chưa đăng
 *      ký được, mà chưa đăng ký thì chưa có `deviceId` để dán vào cấu hình. Người cài chạy lần
 *      đầu chính là để lấy khóa công khai.
 *   3. Đọc cấu hình — thiếu thì ghi nhận, KHÔNG dừng (xem chú thích `relay-config.ts`)
 *   4. Nghe `127.0.0.1`
 *
 * Chỉ một thứ làm cầu nối không khởi động nổi: **không sinh nổi khóa** (thư mục không ghi được)
 * hoặc **cổng bị chiếm**. Cả hai đều là thứ không có trạng thái nào để hiện ra, vì chưa có chỗ
 * nào để hiện.
 */
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { loadRelayConfig, type ConfigProblem } from "./relay-config";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import { resolveRelayHome } from "./relay-home";
import { renderStatusPage } from "./relay-status-page";
import { RELAY_VERSION } from "./relay-version";

async function main(): Promise<void> {
  const home = resolveRelayHome();
  const keypair = loadOrCreateDeviceKeypair(home);
  const configLoad = loadRelayConfig(home);

  const problems: ConfigProblem[] = configLoad.ok ? [] : configLoad.problems;
  const allowedOrigin = configLoad.ok ? configLoad.config.webOrigin : null;

  const server = createRelayServer({
    allowedOrigin,
    statusPage: () =>
      renderStatusPage({
        publicKeyHex: keypair.publicKeyHex,
        home,
        problems,
        // Phép kiểm MultiZen vào ở bước sau của phase này; tới lúc đó trang nói thẳng
        // "chưa kiểm" thay vì khai bừa một câu trả lời nó chưa có.
        antidetectReady: null,
      }),
    routes: {
      "/health": () => ({
        ok: problems.length === 0,
        message:
          problems.length === 0
            ? "Cầu nối sẵn sàng."
            : `Cầu nối đang chạy nhưng chưa cấu hình xong (${problems.length} mục). Mở ${RELAY_ORIGIN} để xem thiếu gì.`,
        publicKey: keypair.publicKeyHex,
        antidetectReady: false,
      }),
    },
  });

  await listenOnLoopback(server);

  // Những dòng này chỉ có người chạy tay từ cửa sổ lệnh mới đọc — người dùng thật đọc trang
  // trạng thái. Nên in đúng thứ giúp được lúc cài: địa chỉ để mở, và khóa để chép.
  console.log(`Cầu nối MKTTool bản ${RELAY_VERSION} đang nghe ở ${RELAY_ORIGIN}`);
  console.log(`Thư mục dữ liệu: ${home}`);
  if (keypair.created) {
    console.log("Đã sinh cặp khóa mới cho máy này.");
  }
  console.log(`Khóa công khai (chép sang trang Máy cầu nối): ${keypair.publicKeyHex}`);
  for (const problem of problems) {
    console.log(`  [thiếu] ${problem.message}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Cầu nối không khởi động được: ${(error as Error).message}`);
  process.exitCode = 1;
});
