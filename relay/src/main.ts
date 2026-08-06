/**
 * Điểm vào của cầu nối.
 *
 * Thứ tự khởi động, và lý do nó là thứ tự này:
 *
 *   1. Xác định thư mục dữ liệu
 *   2. **Đọc hoặc sinh cặp khóa của máy** — trước cấu hình, vì máy chưa có khóa thì chưa đăng
 *      ký được, mà chưa đăng ký thì chưa có `deviceId` để ghi vào cấu hình.
 *   3. Đọc cấu hình — thiếu thì ghi nhận, KHÔNG dừng (xem chú thích `relay-config.ts`)
 *   4. Nghe `127.0.0.1`
 *
 * Chỉ một thứ làm cầu nối không khởi động nổi: **không sinh nổi khóa** (thư mục không ghi được)
 * hoặc **cổng bị chiếm**. Cả hai đều là thứ không có trạng thái nào để hiện ra, vì chưa có chỗ
 * nào để hiện.
 *
 * ## Cấu hình nạp lại được, không phải chụp một lần lúc khởi động
 *
 * Hai đường ghi vào cấu hình chạy **lúc cầu nối đang chạy**: web app đẩy `deviceId` +
 * `serverPublicKey` xuống, và người dùng dán khóa vùng operator ở trang trạng thái. Bắt tắt bật
 * lại sau mỗi lần là dựng lại đúng bước mà cả hai đường sinh ra để dẹp — và tệ hơn: màn hình vừa
 * báo "đã lưu" nên chẳng ai nghĩ là còn phải làm gì nữa.
 *
 * Nên mọi thứ dẫn xuất từ cấu hình gom vào `RelayState` và dựng lại nguyên khối. Dựng lại nguyên
 * khối chứ không vá từng ô: một trạng thái nửa cũ nửa mới là thứ không ai suy luận nổi.
 */
import { RELAY_ORIGIN, RELAY_PATHS, RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import { handleConfigure } from "./handle-configure";
import { handleEncryptForVault } from "./handle-encrypt-for-vault";
import { handleSecretReveal } from "./handle-secret";
import { handleSetOperatorKey } from "./handle-set-operator-key";
import { handleTicketRequest } from "./handle-ticket";
import { RelayAntidetect } from "./relay-antidetect";
import {
  loadRelayConfig,
  resolveDeviceId,
  resolveWebOrigin,
  type ConfigProblem,
} from "./relay-config";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import { resolveRelayHome } from "./relay-home";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import { buildRelayIdentity } from "./relay-identity";
import { renderStatusPage } from "./relay-status-page";
import { SECRET_REVEAL_PATH, renderSecretPage } from "./secret-page";

/** Mọi thứ dẫn xuất từ file cấu hình. Dựng lại nguyên khối mỗi lần cấu hình đổi. */
interface RelayState {
  problems: ConfigProblem[];
  identity: RelayIdentity | null;
  antidetect: RelayAntidetect;
  vaultKeyOperator: Buffer | null;
  /**
   * Nguồn web được tin — cũng chính là nguồn duy nhất được cấp header CORS.
   *
   * Chuỗi trắng nghĩa là **không tin ai**: bản build không nung nguồn nào, hoặc nung một chuỗi
   * không dùng được. Trạng thái đó phải nói ra được chứ không được lặng lẽ tin bừa.
   */
  webOrigin: string;
  deviceId: string | null;
  hasMultizenToken: boolean;
}

function loadState(
  home: string,
  keypair: ReturnType<typeof loadOrCreateDeviceKeypair>,
): RelayState {
  const configLoad = loadRelayConfig(home);
  const problems: ConfigProblem[] = configLoad.ok ? [] : configLoad.problems;
  const config = configLoad.ok ? configLoad.config : null;

  // Danh tính chỉ dựng được khi cấu hình đủ. `null` không làm cầu nối tắt — nó làm mọi đường
  // làm việc thật trả về đúng câu "chưa cấu hình xong", xem `relay-config.ts`.
  //
  // Bọc try/catch vì đây là thao tác duy nhất nằm giữa "cấu hình đã soi xong" và "máy chủ bắt
  // đầu nghe": lỗi ném trần ở đúng chỗ này làm cầu nối TẮT, mà nó chạy nền nên tắt nghĩa là
  // không có gì để nhìn — người dùng chỉ thấy "không thấy cầu nối trên máy này".
  //
  // Đo 06/08: OpenSSL nhận **mọi** 32 byte làm khóa công khai Ed25519, không kiểm điểm có nằm
  // trên đường cong không. Nên với hex đúng hình dạng, nhánh catch này hôm nay không chạy.
  // Hệ quả thật của việc dán nhầm khóa máy chủ là **mọi vé đều BAD_SIGNATURE** — cầu nối không
  // có cách nào phát hiện sớm hơn, vì muốn biết khóa đúng hay sai thì phải có một chữ ký để đối
  // chiếu, mà chữ ký đầu tiên chỉ tới cùng tấm vé đầu tiên.
  let identity: RelayIdentity | null = null;
  if (config) {
    try {
      identity = buildRelayIdentity(config, keypair.privateKey);
    } catch (error) {
      problems.push({ field: "serverPublicKey", message: (error as Error).message });
    }
  }

  return {
    problems,
    identity,
    antidetect: new RelayAntidetect(config),
    // Khóa vùng operator dựng một lần cho mỗi lượt nạp. Nó ở lại trong bộ nhớ tiến trình — đúng
    // như khóa của máy chủ, và vì cùng lý do: đọc lại file ở mỗi lời gọi chỉ thêm một đường hỏng,
    // không thêm lớp bảo vệ nào.
    vaultKeyOperator: config ? Buffer.from(config.vaultKeyOperator, "hex") : null,
    // Nguồn tin đọc ĐỘC LẬP với phần cấu hình còn lại: máy vừa cài chưa có gì trong file, mà
    // chính lúc đó nó cần CORS nhất — đó là lúc web app phải cấu hình hộ nó.
    webOrigin: resolveWebOrigin(home),
    // Đọc thẳng từ file, không qua `config`: web app vừa ghi mã máy xuống và cần thấy nó tới nơi,
    // kể cả khi khóa vùng operator còn thiếu — mà thiếu nó thì `config` là `null`.
    deviceId: resolveDeviceId(home),
    hasMultizenToken: Boolean(config?.multizenToken),
  };
}

async function main(): Promise<void> {
  const home = resolveRelayHome();
  const keypair = loadOrCreateDeviceKeypair(home);

  let state = loadState(home, keypair);

  const notConfiguredMessage = (): string =>
    `Cầu nối trên máy này chưa cấu hình xong (${state.problems.length} mục còn thiếu). ` +
    `Mở ${RELAY_ORIGIN} trên máy đó để xem thiếu gì.`;

  /** Nạp lại sau khi file cấu hình đổi, rồi nói ra hiện trạng — kể cả khi vẫn còn thiếu. */
  function reloadConfig(): { ok: boolean; message: string } {
    state = loadState(home, keypair);

    if (state.problems.length === 0) {
      return { ok: true, message: "Đã lưu. Cầu nối trên máy này sẵn sàng." };
    }

    // `ok: true` vì việc vừa yêu cầu ĐÃ làm xong — nói "thất bại" ở đây là đẩy người dùng đi sửa
    // thứ họ vừa làm đúng. Phần còn thiếu là việc kế tiếp, không phải lỗi của việc vừa rồi.
    return {
      ok: true,
      message: `Đã lưu. Còn thiếu: ${state.problems.map((p) => p.message).join(" ")}`,
    };
  }

  const server = createRelayServer({
    allowedOrigin: () => state.webOrigin || null,
    htmlPages: {
      "/": async () =>
        renderStatusPage({
          publicKeyHex: keypair.publicKeyHex,
          home,
          problems: state.problems,
          webOrigin: state.webOrigin,
          config: state.deviceId
            ? {
                deviceId: state.deviceId,
                webOrigin: state.webOrigin,
                hasMultizenToken: state.hasMultizenToken,
              }
            : null,
          // Hỏi MultiZen NGAY lúc vẽ trang. Người cài mở trang này chính là để biết MultiZen
          // có nối được không — in ra một kết quả nhớ từ lần nào đó trước là trả lời câu hỏi
          // của họ bằng tin cũ. Chưa điền token thì không hỏi được: `null`, và trang nói đúng
          // là "chưa điền token" chứ không phải "không nối được".
          antidetectReady: state.hasMultizenToken ? await state.antidetect.isReady() : null,
        }),
      [RELAY_PATHS.secret]: renderSecretPage,
    },
    routes: {
      [RELAY_PATHS.health]: async () => ({
        ok: state.problems.length === 0,
        message: state.problems.length === 0 ? "Cầu nối sẵn sàng." : notConfiguredMessage(),
        publicKey: keypair.publicKeyHex,
        // Web app cần biết máy này đã đăng ký chưa để vẽ đúng nút — "Đăng ký máy này" hay
        // "Đã đăng ký". Hỏi sổ trên máy chủ cũng ra, nhưng phải hỏi bằng khóa công khai và
        // vẫn không biết chiếc máy ĐANG NGỒI nghĩ mình là ai.
        configured: state.problems.length === 0,
        deviceId: state.deviceId,
        webOrigin: state.webOrigin,
        antidetectReady: await state.antidetect.isReady(),
      }),
      [RELAY_PATHS.configure]: (request, body) =>
        handleConfigure(request, body, {
          allowedOrigin: state.webOrigin || null,
          home,
          onConfigured: reloadConfig,
        }),
      [RELAY_PATHS.setOperatorKey]: (request, body) =>
        handleSetOperatorKey(request, body, { home, onConfigured: reloadConfig }),
      [RELAY_PATHS.ticket]: (_request, body) =>
        handleTicketRequest(body, {
          identity: state.identity,
          antidetect: state.antidetect,
          notConfiguredMessage: notConfiguredMessage(),
        }),
      [SECRET_REVEAL_PATH]: (_request, body) =>
        handleSecretReveal(body, {
          identity: state.identity,
          vaultKeyOperator: state.vaultKeyOperator,
          notConfiguredMessage: notConfiguredMessage(),
        }),
      [RELAY_PATHS.encryptForVault]: (_request, body) =>
        handleEncryptForVault(body, {
          vaultKeyOperator: state.vaultKeyOperator,
          notConfiguredMessage: notConfiguredMessage(),
        }),
    },
  });

  await listenOnLoopback(server);

  // Những dòng này chỉ có người chạy tay từ cửa sổ lệnh mới đọc — người dùng thật đọc trang
  // trạng thái. Nên in đúng thứ giúp được lúc cài: địa chỉ để mở, và khóa để chép.
  console.log(`Cầu nối MKTTool bản ${RELAY_VERSION} đang nghe ở ${RELAY_ORIGIN}`);
  console.log(`Thư mục dữ liệu: ${home}`);
  console.log(`Nguồn web được tin: ${state.webOrigin || "(chưa có — bản build hỏng)"}`);
  if (keypair.created) {
    console.log("Đã sinh cặp khóa mới cho máy này.");
  }
  console.log(`Khóa công khai: ${keypair.publicKeyHex}`);
  for (const problem of state.problems) {
    console.log(`  [thiếu] ${problem.message}`);
  }
}

main().catch((error: unknown) => {
  console.error(`Cầu nối không khởi động được: ${(error as Error).message}`);
  process.exitCode = 1;
});
