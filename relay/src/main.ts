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
import os from "node:os";
import { RELAY_ORIGIN, RELAY_PATHS, RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import { handleConfigure } from "./handle-configure";
import { handleEncryptForVault } from "./handle-encrypt-for-vault";
import { handleReceiveOperatorKey } from "./handle-receive-operator-key";
import { handleSealOperatorKey } from "./handle-seal-operator-key";
import { handleSecretReveal } from "./handle-secret";
import { handleSetOperatorKey } from "./handle-set-operator-key";
import { handleAuthorizeBootstrap } from "./handle-authorize-bootstrap";
import { handleReadBootstrapCompletion } from "./handle-read-bootstrap-completion";
import { handleRetireDevice } from "./handle-retire-device";
import { handleFinalizeDeviceRetirement } from "./handle-finalize-device-retirement";
import { handleCompatibilityRollback } from "./handle-compatibility-rollback";
import { handleCompatibilityUpdate } from "./handle-compatibility-update";
import { handleLicenseCapacityRefresh } from "./handle-license-capacity-refresh";
import { BootstrapAuthorizationBroker } from "./bootstrap-authorization";
import { readOperatorGrantState } from "./operator-grant-state";
import { handleProfilesRequest } from "./handle-profiles";
import { handleTicketRequest } from "./handle-ticket";
import { RelayAntidetect } from "./relay-antidetect";
import {
  loadRelayConfig,
  resolveDeviceId,
  resolveServerPublicKey,
  resolveWebOrigin,
  type ConfigProblem,
} from "./relay-config";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { createRelayServer, listenOnLoopback } from "./relay-http-server";
import { defineRelayRoutes } from "./relay-route-policy";
import { resolveRelayHome } from "./relay-home";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import { publicKeyFromHex } from "../../src/lib/tickets/server-signing-key";
import { buildRelayIdentity } from "./relay-identity";
import { SpentTicketJournalError } from "./spent-ticket-journal";
import { renderStatusPage } from "./relay-status-page";
import { SECRET_REVEAL_PATH, renderSecretPage } from "./secret-page";
import { migrateRelaySecrets } from "./secret-migration";
import type { SecureStore } from "./secure-store";
import { WindowsSecureStore } from "./windows-secure-store";
import {
  loadPendingRetirementReceipt,
  retirementBlocked,
  retirementHealth,
  runRetirementRecoveryServer,
} from "./device-retirement-recovery-server";
import type { DeviceRetirementReceipt } from "./device-retirement-receipt";
import { handleWindowsCompatibilityStartup } from "./windows-compatibility-startup";
import { coordinateCompatibilityUpdateHelper } from "./compatibility-update-helper";
import { describeCompatibilityUpdateHealth } from "./compatibility-update-health";
import { readCompatibilityUpdateState } from "./update-state";
import { resolveWindowsCompatibilityInstallation } from "./windows-compatibility-installation";
import { WindowsCompatibilityUpdatePlatform } from "./windows-compatibility-update-platform";

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
  serverPublicKey: ReturnType<typeof publicKeyFromHex> | null;
  serverPublicKeyHex: string | null;
}

function loadState(
  home: string,
  keypair: ReturnType<typeof loadOrCreateDeviceKeypair>,
  secureStore: SecureStore,
): RelayState {
  const configLoad = loadRelayConfig(home, secureStore);
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
      identity = buildRelayIdentity(config, keypair.privateKey, home);
    } catch (error) {
      problems.push({
        field: error instanceof SpentTicketJournalError ? "spentTicketJournal" : "serverPublicKey",
        message: (error as Error).message,
      });
    }
  }

  const serverPublicKeyHex = resolveServerPublicKey(home);
  let serverPublicKey: ReturnType<typeof publicKeyFromHex> | null = null;
  if (serverPublicKeyHex) {
    try {
      serverPublicKey = publicKeyFromHex(serverPublicKeyHex);
    } catch {
      // The full config review reports the actionable field error.
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
    serverPublicKey,
    serverPublicKeyHex,
  };
}

async function main(): Promise<void> {
  const home = resolveRelayHome();
  const secureStore = new WindowsSecureStore(home);
  const retirementReceipt = loadPendingRetirementReceipt(secureStore);
  if (retirementReceipt) {
    await runRetirementRecoveryServer(home, secureStore, retirementReceipt);
    return;
  }
  if (await handleWindowsCompatibilityStartup(home, secureStore)) return;
  migrateRelaySecrets(home, secureStore, RELAY_VERSION);
  const keypair = loadOrCreateDeviceKeypair(home, secureStore);
  migrateRelaySecrets(home, secureStore, RELAY_VERSION);

  let state = loadState(home, keypair, secureStore);
  let pendingRetirement: DeviceRetirementReceipt | null = null;
  const bootstrap = new BootstrapAuthorizationBroker(
    () => state.deviceId,
    keypair.publicKeyHex,
    keypair.privateKey,
    () => state.serverPublicKey,
    Date.now,
    () => readOperatorGrantState(secureStore)?.generation ?? null,
  );

  const notConfiguredMessage = (): string => {
    const journalProblem = state.problems.find((problem) => problem.field === "spentTicketJournal");
    if (journalProblem) return journalProblem.message;
    return (
      `Cầu nối trên máy này chưa cấu hình xong (${state.problems.length} mục còn thiếu). ` +
      `Mở ${RELAY_ORIGIN} trên máy đó để xem thiếu gì.`
    );
  };

  /** Nạp lại sau khi file cấu hình đổi, rồi nói ra hiện trạng — kể cả khi vẫn còn thiếu. */
  function reloadConfig(): { ok: boolean; message: string } {
    state = loadState(home, keypair, secureStore);

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
    allowedOrigin: () => pendingRetirement?.webOrigin ?? (state.webOrigin || null),
    htmlPages: {
      "/": async () => {
        const tokenStatus = state.antidetect.tokenStatus();
        return renderStatusPage({
          publicKeyHex: keypair.publicKeyHex,
          home,
          problems: state.problems,
          webOrigin: state.webOrigin,
          config: state.deviceId
            ? {
                deviceId: state.deviceId,
                webOrigin: state.webOrigin,
                hasMktBrowserToken: tokenStatus.available,
                mktBrowserTokenSource: tokenStatus.source,
              }
            : null,
          // Probe MKT Browser while rendering the page. The installer opens this page to see
          // whether it is reachable, so a cached result would answer with stale state. Without a
          // token the probe cannot run: `null` lets the page report "token not configured" instead
          // of "cannot connect".
          antidetectReady: tokenStatus.available ? await state.antidetect.isReady() : null,
          bootstrapAuthorized: bootstrap.isAuthorized(),
        });
      },
      [RELAY_PATHS.secret]: renderSecretPage,
    },
    routes: defineRelayRoutes({
      [RELAY_PATHS.health]: async () => ({
        ...(pendingRetirement
          ? retirementHealth(pendingRetirement)
          : {
        ok: state.problems.length === 0,
        message: state.problems.length === 0 ? "Cầu nối sẵn sàng." : notConfiguredMessage(),
        publicKey: keypair.publicKeyHex,
        machineName: os.hostname(),
        // Web app cần biết máy này đã đăng ký chưa để vẽ đúng nút — "Đăng ký máy này" hay
        // "Đã đăng ký". Hỏi sổ trên máy chủ cũng ra, nhưng phải hỏi bằng khóa công khai và
        // vẫn không biết chiếc máy ĐANG NGỒI nghĩ mình là ai.
        configured: state.problems.length === 0,
        deviceId: state.deviceId,
        webOrigin: state.webOrigin,
        antidetectReady: await state.antidetect.isReady(),
        // Bốn tầng của CHÍNH máy này. Web dùng nó để nói đúng chỗ hỏng thay vì "không kết nối
        // được", và để chặn sớm một máy chạy bản hợp đồng khác.
        browser: await state.antidetect.describeRuntime(),
        compatibilityUpdate: describeCompatibilityUpdateHealth(
          readCompatibilityUpdateState(secureStore),
        ),
          }),
      }),
      [RELAY_PATHS.configure]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleConfigure(request, body, {
              allowedOrigin: state.webOrigin || null,
              home,
              onConfigured: reloadConfig,
            }),
      [RELAY_PATHS.setOperatorKey]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleSetOperatorKey(request, body, {
              home,
              secureStore,
              bootstrap: state.vaultKeyOperator ? undefined : bootstrap,
              onConfigured: reloadConfig,
            }),
      [RELAY_PATHS.authorizeBootstrap]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleAuthorizeBootstrap(request, body, state.webOrigin || null, bootstrap),
      [RELAY_PATHS.bootstrapCompletion]: (request) =>
        pendingRetirement
          ? retirementBlocked()
          : handleReadBootstrapCompletion(request, state.webOrigin || null, secureStore),
      [RELAY_PATHS.ticket]: (_request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleTicketRequest(body, {
              identity: state.identity,
              antidetect: state.antidetect,
              home,
              notConfiguredMessage: notConfiguredMessage(),
            }),
      // Không cần vé, và không cần cả `identity`: đường này chỉ đọc danh sách profile của chính
      // máy đang chạy — xem chú thích đầu `handle-profiles.ts`.
      [RELAY_PATHS.profiles]: () =>
        pendingRetirement ? retirementBlocked() : handleProfilesRequest(state.antidetect),
      [RELAY_PATHS.licenseCapacityRefresh]: (request) =>
        pendingRetirement
          ? retirementBlocked()
          : handleLicenseCapacityRefresh(request, {
              allowedOrigin: state.webOrigin || null,
              antidetect: state.antidetect,
            }),
      [SECRET_REVEAL_PATH]: (_request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleSecretReveal(body, {
              identity: state.identity,
              vaultKeyOperator: state.vaultKeyOperator,
              notConfiguredMessage: notConfiguredMessage(),
            }),
      [RELAY_PATHS.encryptForVault]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleEncryptForVault(request, body, {
              vaultKeyOperator: state.vaultKeyOperator,
              allowedOrigin: state.webOrigin || null,
              notConfiguredMessage: notConfiguredMessage(),
            }),
      [RELAY_PATHS.sealOperatorKey]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleSealOperatorKey(request, body, {
              allowedOrigin: state.webOrigin || null,
              vaultKeyOperator: state.vaultKeyOperator,
              notConfiguredMessage: notConfiguredMessage(),
            }),
      [RELAY_PATHS.receiveOperatorKey]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleReceiveOperatorKey(request, body, {
              allowedOrigin: state.webOrigin || null,
              deviceId: state.deviceId,
              devicePublicKey: keypair.publicKeyHex,
              devicePrivateKey: keypair.privateKey,
              // `state.serverPublicKey`, KHÔNG phải `state.identity` — và đây là cả cái bẫy.
              //
              // `identity` chỉ dựng được khi cấu hình **hợp lệ trọn vẹn**, mà "trọn vẹn" bao gồm
              // `vaultKeyOperator`. Đường này tồn tại để **mang khóa đó xuống**. Đọc khóa máy chủ
              // qua `identity` nghĩa là: máy chưa có khóa thì không nhận được khóa — một vòng tròn
              // khép kín, và câu nó phát ra là "This Relay is not enrolled yet." trên một chiếc máy
              // đã đăng ký đàng hoàng, nên không ai lần ra được.
              //
              // Cùng đúng một lý lẽ với `deviceId` ở `loadState`: đọc thẳng nguồn thô, không qua
              // `config`, vì thiếu khóa vùng operator là `config` thành `null`. Chỗ đó đã làm đúng
              // từ đầu; chỗ này thì không.
              serverPublicKey: state.serverPublicKey,
              secureStore,
              onConfigured: reloadConfig,
            }),
      [RELAY_PATHS.retireDevice]: (request, body) =>
        handleRetireDevice(request, body, {
          allowedOrigin: pendingRetirement?.webOrigin ?? (state.webOrigin || null),
          home,
          secureStore,
          activeIdentity:
            !pendingRetirement && state.deviceId && state.serverPublicKey
              ? {
                  deviceId: state.deviceId,
                  devicePublicKey: keypair.publicKeyHex,
                  devicePrivateKey: keypair.privateKey,
                  serverPublicKey: state.serverPublicKey,
                  webOrigin: state.webOrigin,
                }
              : null,
          onRetired: () => {
            pendingRetirement = loadPendingRetirementReceipt(secureStore);
            state = loadState(home, keypair, secureStore);
          },
        }),
      [RELAY_PATHS.finalizeDeviceRetirement]: (request, body) =>
        handleFinalizeDeviceRetirement(request, body, {
          allowedOrigin: pendingRetirement?.webOrigin ?? (state.webOrigin || null),
          home,
          secureStore,
          onFinalized: () => server.close(),
        }),
      [RELAY_PATHS.compatibilityUpdate]: (request, body) =>
        pendingRetirement
          ? retirementBlocked()
          : handleCompatibilityUpdate(request, body, {
              allowedOrigin: state.webOrigin || null,
              home,
              store: secureStore,
              identity: state.identity,
              antidetect: state.antidetect,
              createPlatform: () => {
                const installation = resolveWindowsCompatibilityInstallation();
                return new WindowsCompatibilityUpdatePlatform({
                  installation,
                  hasOpenProfiles: async () => {
                    const profiles = await state.antidetect.getAdapter().listProfiles();
                    return profiles.some((profile) => profile.isRunning === true);
                  },
                });
              },
              serverPublicKeyHex: state.serverPublicKeyHex,
              deviceId: state.deviceId,
              onPrepared: () => {
                setTimeout(() => {
                  server.close();
                  void coordinateCompatibilityUpdateHelper({
                    home,
                    argv: [],
                    executablePath: process.execPath,
                    converge: async () => {},
                  }).catch((error: unknown) => {
                    console.error(`Compatibility helper could not start: ${(error as Error).message}`);
                    process.exitCode = 1;
                  });
                }, 100);
              },
            }),
      [RELAY_PATHS.compatibilityRollback]: (request, body) => {
        return pendingRetirement
          ? retirementBlocked()
          : handleCompatibilityRollback(request, body, {
              allowedOrigin: state.webOrigin || null,
              home,
              store: secureStore,
              createPlatform: () => {
                const installation = resolveWindowsCompatibilityInstallation();
                return new WindowsCompatibilityUpdatePlatform({
                  installation,
                  hasOpenProfiles: async () => {
                    const profiles = await state.antidetect.getAdapter().listProfiles();
                    return profiles.some((profile) => profile.isRunning === true);
                  },
                });
              },
              serverPublicKeyHex: state.serverPublicKeyHex,
              deviceId: state.deviceId,
              onPrepared: () => {
                setTimeout(() => {
                  server.close();
                  void coordinateCompatibilityUpdateHelper({
                    home,
                    argv: [],
                    executablePath: process.execPath,
                    converge: async () => {},
                  }).catch((error: unknown) => {
                    console.error(`Compatibility helper could not start: ${(error as Error).message}`);
                    process.exitCode = 1;
                  });
                }, 100);
              },
            });
      },
    }),
  });

  await listenOnLoopback(server);

  // The packaged smoke harness sends SIGTERM between restart legs. Close the listener before
  // exiting so the process does not leave a half-open port while its journal is already durable.
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);

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
