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
import { RELAY_ORIGIN, RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import { handleSecretReveal } from "./handle-secret";
import { handleTicketRequest } from "./handle-ticket";
import { RelayAntidetect } from "./relay-antidetect";
import { loadRelayConfig, type ConfigProblem } from "./relay-config";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import { resolveRelayHome } from "./relay-home";
import { buildRelayIdentity } from "./relay-identity";
import { renderStatusPage } from "./relay-status-page";
import { SECRET_REVEAL_PATH, renderSecretPage } from "./secret-page";
import { RELAY_VERSION } from "./relay-version";

async function main(): Promise<void> {
  const home = resolveRelayHome();
  const keypair = loadOrCreateDeviceKeypair(home);
  const configLoad = loadRelayConfig(home);

  const problems: ConfigProblem[] = configLoad.ok ? [] : configLoad.problems;
  const config = configLoad.ok ? configLoad.config : null;
  const allowedOrigin = config?.webOrigin ?? null;

  // Danh tính chỉ dựng được khi cấu hình đủ. `null` không làm cầu nối tắt — nó làm mọi đường
  // làm việc thật trả về đúng câu "chưa cấu hình xong", xem `relay-config.ts`.
  const identity = config ? buildRelayIdentity(config, keypair.privateKey) : null;
  const antidetect = new RelayAntidetect(config);

  const notConfiguredMessage =
    `Cầu nối trên máy này chưa cấu hình xong (${problems.length} mục còn thiếu). ` +
    `Mở ${RELAY_ORIGIN} trên máy đó để xem thiếu gì.`;

  // Khóa vùng operator dựng một lần lúc khởi động. Nó ở lại trong bộ nhớ tiến trình suốt đời
  // cầu nối — đúng như khóa của máy chủ, và vì cùng lý do: đọc lại file ở mỗi lời gọi chỉ thêm
  // một đường hỏng, không thêm lớp bảo vệ nào.
  const vaultKeyOperator = config ? Buffer.from(config.vaultKeyOperator, "hex") : null;

  const server = createRelayServer({
    allowedOrigin,
    htmlPages: {
      "/": () =>
        renderStatusPage({
          publicKeyHex: keypair.publicKeyHex,
          home,
          problems,
          // Trang trạng thái dựng đồng bộ nên nó đọc kết quả đã nhớ của lần hỏi gần nhất; lần
          // hỏi thật do `/health` bắn. Chưa hỏi lần nào thì nói thẳng "chưa kiểm".
          antidetectReady: antidetect.lastProbe(),
        }),
      [RELAY_PATHS.secret]: renderSecretPage,
    },
    routes: {
      [RELAY_PATHS.health]: async () => ({
        ok: problems.length === 0,
        message: problems.length === 0 ? "Cầu nối sẵn sàng." : notConfiguredMessage,
        publicKey: keypair.publicKeyHex,
        antidetectReady: await antidetect.isReady(),
      }),
      [RELAY_PATHS.ticket]: (_request, body) =>
        handleTicketRequest(body, { identity, antidetect, notConfiguredMessage }),
      [SECRET_REVEAL_PATH]: (_request, body) =>
        handleSecretReveal(body, { identity, vaultKeyOperator, notConfiguredMessage }),
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
