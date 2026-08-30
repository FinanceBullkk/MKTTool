/**
 * Nghiệm thu **chính file `.exe`** vừa đóng gói, không phải mã nguồn của nó.
 *
 * Chạy: `npm run relay:verify` (sau `npm run relay:build`)
 *
 * ## Vì sao phải có bài này khi đã có 772 test
 *
 * Bộ test chạy mã nguồn dưới `vitest`. Đóng gói là một phép biến đổi khác hẳn: esbuild gộp cây
 * import, SEA nhét kết quả vào `node.exe`, và mọi giả định ngầm về **file nằm ở đâu** đổi nghĩa
 * — `process.execPath` không còn trỏ tới Node của máy dev mà trỏ tới chính `.exe`, `__dirname`
 * biến mất. Kiểu hỏng của bước này không giống kiểu hỏng nào mà bộ test bắt được, nên nó cần
 * phép kiểm riêng, và phép kiểm đó phải nói chuyện với `.exe` qua đúng con đường web app dùng.
 *
 * ## Vì sao đi tới tận mật khẩu dạng trần
 *
 * Phép kiểm rẻ nhất là "gọi `/health` thấy 200 là xong". Nó chứng minh `.exe` khởi động được và
 * **không chứng minh gì thêm** — trong khi thứ đáng sợ ở đây là mật mã: X25519, Ed25519, AES.
 * Ba thứ đó hỏng sau khi gói lại thì `/health` vẫn xanh, và triệu chứng đầu tiên sẽ là một
 * operator đứng trước cửa sổ báo "không mở được ruột vé" vào ngày bàn giao.
 *
 * Nên bài này đi trọn vòng: máy chủ (tiến trình này) phát vé thật → `.exe` mở ra → so mật khẩu
 * lấy được với chuỗi đã gửi đi. Sai một byte ở bất cứ đâu trong dây chuyền là đỏ.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { decryptCredential, encryptCredential } from "../src/lib/crypto/credential-encryption";
import { issueGrantAuthorization } from "../src/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof } from "../src/lib/relay/enrollment/grant-digests";
import {
  hashDeviceRetirementProof,
  issueDeviceRetirementAuthorization,
} from "../src/lib/relay/retirement/device-retirement-authorization";
import { issueDeviceRetirementFinalization } from "../src/lib/relay/retirement/device-retirement-finalization";
import { RELAY_ORIGIN, RELAY_PATHS, RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import {
  publicKeyToHex,
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";
import { issueTicket } from "../src/lib/tickets/ticket-issuer";
import { sealForDevice } from "../src/lib/tickets/ticket-sealed-box";
import { TICKET_KINDS, TICKET_LIFETIME_MS } from "../src/lib/tickets/ticket-types";
import { SPENT_TICKET_JOURNAL_FILE, readSpentTickets } from "../relay/src/spent-ticket-journal";
import {
  makeTempHome,
  prepareRelayCandidate,
  relayCall,
  removeTempHome,
  startRelay,
} from "./relay-executable-harness";

const DEVICE_ID = "smoke-device-0001";
const PASSWORD = "MatKhau-Nghiem-Thu-7731";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
/** Vé bí mật đi qua đường riêng, không qua `/ticket`. Xem `secret-page.ts`. */
const SECRET_REVEAL_PATH = "/secret/reveal";

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

/** Ký vé bằng một khóa máy chủ dựng riêng cho lượt chạy này, không đụng khóa thật trong `.env`. */
function makeThrowawayServerKey() {
  const seed = randomBytes(32);
  process.env.TICKET_SIGNING_KEY = seed.toString("hex");
  resetServerSigningKeysCache();
  const keys = signingKeysFromSeed(seed);
  return { publicKey: publicKeyToHex(keys.publicKey), privateKey: keys.privateKey };
}

async function run() {
  const archiveArgument = process.argv
    .find((argument) => argument.startsWith("--archive="))
    ?.slice("--archive=".length)
    .trim() || process.env.RELAY_CANDIDATE_ARCHIVE?.trim();
  const metadataArgument = process.argv
    .find((argument) => argument.startsWith("--metadata="))
    ?.slice("--metadata=".length)
    .trim() || process.env.RELAY_CANDIDATE_METADATA?.trim();
  if (!archiveArgument) {
    console.error(
      "\nRelay verification requires an explicit candidate archive. It never falls back to relay/dist.\n" +
        "Run `npm run relay:verify -- --archive=relay/dist/MKTTool-Relay.zip`.\n",
    );
    process.exit(1);
  }

  const candidate = prepareRelayCandidate(archiveArgument, metadataArgument);

  const home = makeTempHome();
  const vaultKeyOperator = randomBytes(32);
  const serverKeys = makeThrowawayServerKey();

  console.log(`\nNghiệm thu candidate Relay v${candidate.version}`);
  console.log(`Archive: ${candidate.archivePath}`);
  console.log(`Archive SHA-256: ${candidate.archiveSha256}`);
  console.log(`Extracted EXE SHA-256: ${candidate.executableSha256}`);
  console.log(`Thư mục dữ liệu tạm: ${home}\n`);

  // Một lượt chạy duy nhất cho cả bài: từ bản 2, cấu hình nạp nóng nên không còn chỗ nào phải
  // tắt/bật lại giữa chừng — và chính điều đó là thứ bài này đang chứng minh.
  let relay = await startRelay(home, candidate.executablePath);
  try {
    console.log("Lượt 1 — chưa có file cấu hình");
    const bare = await relayCall(RELAY_PATHS.health);
    check("cầu nối chạy và trả lời", bare.publicKey !== undefined);
    check("nói thẳng là chưa cấu hình xong", bare.ok === false, String(bare.message).slice(0, 60));
    check("khai đúng phiên bản", bare.relayVersion === RELAY_VERSION, `bản ${bare.relayVersion}`);

    const devicePublicKey = String(bare.publicKey);
    check(
      "tự sinh khóa của máy, 64 ký tự hex",
      /^[0-9a-f]{64}$/.test(devicePublicKey),
      devicePublicKey.slice(0, 12) + "…",
    );

    // Cấu hình bằng ĐÚNG đường mà GĐ6 dùng — không ghi tay file rồi tắt/bật lại. Đây là chỗ duy
    // nhất chứng minh được luồng cài mới chạy trên chính `.exe` đã đóng gói, gồm cả việc nạp lại
    // cấu hình nóng: cả khối dưới đây không có một lượt khởi động lại nào.
    console.log("\nLượt 2 — web app cấu hình hộ (không tắt/bật lại)");
    const bakedOrigin = String(bare.webOrigin);
    check("khai ra nguồn web nó tin", /^https?:\/\//.test(bakedOrigin), bakedOrigin);

    const wrongOrigin = await relayCall(
      RELAY_PATHS.configure,
      { deviceId: DEVICE_ID, serverPublicKey: serverKeys.publicKey },
      { origin: "https://ke-tan-cong.example" },
    );
    // Nguồn lạ mà ghi được là cầu nối bị trỏ sang máy chủ khác — lúc đó nó thành máy giải mã thuê
    // cho bất kỳ ciphertext nào lấy được từ một bản sao lưu rò rỉ.
    check("nguồn lạ bị từ chối", wrongOrigin.ok === false, String(wrongOrigin.message).slice(0, 60));

    const configured = await relayCall(
      RELAY_PATHS.configure,
      { deviceId: DEVICE_ID, serverPublicKey: serverKeys.publicKey },
      { origin: bakedOrigin },
    );
    check("nhận cấu hình từ đúng nguồn web", configured.ok === true, String(configured.message));

    const afterConfigure = await relayCall(RELAY_PATHS.health);
    check("đã nhận mã máy", afterConfigure.deviceId === DEVICE_ID);
    // Còn thiếu khóa vùng operator, và phải nói thẳng là còn thiếu: máy chủ không có khóa đó để
    // gửi xuống, nên đây là bước người dùng phải tự làm.
    check("vẫn báo chưa xong vì thiếu khóa operator", afterConfigure.ok === false);

    const authorizationId = randomUUID();
    const proof = randomBytes(32).toString("base64url");
    const completion = sealForDevice({ proof }, devicePublicKey);
    const bootstrapAuthorization = issueGrantAuthorization(
      {
        kind: "bootstrap",
        authorizationId,
        deviceId: DEVICE_ID,
        recipientPublicKey: devicePublicKey,
        grantId: authorizationId,
        generation: 1,
        grantHash: createHash("sha256").update(`bootstrap\n${authorizationId}`).digest("hex"),
        completionHash: hashGrantCompletionProof(proof),
        completionEphemeralPublicKey: completion.ephemeralPublicKey,
        completionSealed: completion.sealed,
      },
      serverKeys.privateKey,
      Date.now(),
      300_000,
    );
    const authorized = await relayCall(
      RELAY_PATHS.authorizeBootstrap,
      { authorization: bootstrapAuthorization },
      { origin: bakedOrigin },
    );
    check("accepts a server-signed bootstrap authorization", authorized.ok === true, String(authorized.message));

    const keySet = await relayCall(
      RELAY_PATHS.setOperatorKey,
      { vaultKeyOperator: vaultKeyOperator.toString("hex") },
      { origin: RELAY_ORIGIN },
    );
    check("nhận khóa operator từ trang của chính nó", keySet.ok === true, String(keySet.message));

    const completionProof = await relayCall(
      RELAY_PATHS.bootstrapCompletion,
      undefined,
      { origin: bakedOrigin },
    );
    check(
      "returns the persisted bootstrap completion proof",
      completionProof.ok === true && completionProof.proof === proof,
      String(completionProof.message),
    );

    const fromWeb = await relayCall(
      RELAY_PATHS.setOperatorKey,
      { vaultKeyOperator: vaultKeyOperator.toString("hex") },
      { origin: bakedOrigin },
    );
    // Khóa vùng operator đi qua trang web là khóa đã đi qua máy chủ — cả GĐ3 mất nghĩa ở đó.
    check("web app KHÔNG dán được khóa operator", fromWeb.ok === false);

    console.log("\nLượt 3 — sẵn sàng, chưa lần nào khởi động lại");
    const ready = await relayCall(RELAY_PATHS.health);
    check("báo sẵn sàng", ready.ok === true, String(ready.message));

    console.log("\nBọc bí mật bằng khóa vùng operator (đường tạo/sửa nick)");
    // The origin is mandatory — F4 made this route check `Origin`, because without it every page
    // the operator has open can use the Relay as a rented encryption engine for ciphertext of its
    // own choosing. This suite was not updated when F4 landed, so it had been red for days with
    // nobody watching: it needs a Windows-built `.exe`, and at the time nothing built one except a
    // person. That is no longer true — the `relay-executable` job in `.github/workflows/ci.yml`
    // builds and runs this suite on self-hosted Windows for every pull request (C37).
    const sealed = await relayCall(RELAY_PATHS.encryptForVault, {
      password: PASSWORD,
      totpSecret: `${TOTP_SECRET.toLowerCase()}  `,
    }, { origin: bakedOrigin });
    check("nhận lời", sealed.ok === true, String(sealed.message));
    check(
      "mật khẩu bọc xong mở lại ra đúng nguyên văn",
      typeof sealed.passwordEnc === "string" &&
        decryptCredential(sealed.passwordEnc, vaultKeyOperator) === PASSWORD,
    );
    check(
      "TOTP secret được chuẩn hóa trước khi bọc",
      typeof sealed.totpSecretEnc === "string" &&
        decryptCredential(sealed.totpSecretEnc, vaultKeyOperator) === TOTP_SECRET,
    );

    const halfway = await relayCall(RELAY_PATHS.encryptForVault, {
      password: PASSWORD,
      totpSecret: "khong-phai-base32!!",
    }, { origin: bakedOrigin });
    check("TOTP hỏng thì KHÔNG bọc nửa vời", halfway.ok === false && halfway.passwordEnc === undefined);

    console.log("\nVé mở profile");
    const launchTicket = issueTicket(
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: "smoke",
        antidetectProfileId: "smoke-profile",
        proxyLabel: "smoke-proxy",
        proxy: { protocol: "http", host: "127.0.0.1", port: 1080 },
      },
      { deviceId: DEVICE_ID, publicKey: devicePublicKey },
    );

    const forged = await relayCall(RELAY_PATHS.ticket, {
      ticket: `${launchTicket.split(".")[0]}.${Buffer.from(randomBytes(64)).toString("base64url")}`,
    });
    check("vé giả bị từ chối", forged.rejectionCode === "BAD_SIGNATURE", String(forged.message));

    // This is a valid ticket, but the machine has no MKT Browser token. Rejection at the BROWSER
    // LAUNCH step proves that signature verification, decryption, and payload validation passed.
    const launched = await relayCall(RELAY_PATHS.ticket, { ticket: launchTicket });
    check(
      "vé thật đi hết chữ ký + giải mã + soi ruột",
      launched.ok === false && !String(launched.rejectionCode ?? ""),
      String(launched.message).slice(0, 70),
    );

    const replayed = await relayCall(RELAY_PATHS.ticket, { ticket: launchTicket });
    check("vé dùng lại bị chặn", replayed.rejectionCode === "ALREADY_USED", String(replayed.message));

    /**
     * Chặn được vé dùng lại **trong cùng một lượt chạy** chỉ chứng minh sổ trong bộ nhớ hoạt động.
     * Gate `G3-RECOVERY` hỏi câu khó hơn: sổ có sống qua một lần khởi động lại không.
     *
     * Ở đây kiểm nửa mà `.exe` chịu trách nhiệm — nó có thật sự ghi jti vừa tiêu xuống đĩa hay
     * không. Nửa còn lại, "nạp sổ lên thì vé cũ vẫn bị chặn", là `ticket-replay-guard.test.ts`.
     * Tách vậy vì tắt/bật lại `.exe` giữa bài sẽ dựng thêm một cuộc đua cổng, mà bài này vốn là
     * bài duy nhất chứng minh cấu hình nạp nóng không cần khởi động lại lần nào.
     */
    const spentJti = (
      JSON.parse(
        Buffer.from(launchTicket.split(".")[0], "base64url").toString("utf8"),
      ) as { jti: string }
    ).jti;
    const journalled = readSpentTickets(home);
    check(
      "vé đã tiêu được ghi xuống sổ trên đĩa",
      journalled.some((record) => record.jti === spentJti),
      `${journalled.length} mục trong ${SPENT_TICKET_JOURNAL_FILE}`,
    );

    console.log("\nLượt 4 — dừng, khởi động lại đúng EXE + đúng home");
    relay.stop();
    await relay.waitForExit();
    relay = await startRelay(home, candidate.executablePath);
    const afterRestart = await relayCall(RELAY_PATHS.health);
    check("Relay khởi động lại và giữ cấu hình", afterRestart.deviceId === DEVICE_ID);

    const replayAfterRestart = await relayCall(RELAY_PATHS.ticket, { ticket: launchTicket });
    check(
      "vé đã tiêu bị chặn sau restart",
      replayAfterRestart.rejectionCode === "ALREADY_USED",
      String(replayAfterRestart.message),
    );

    const freshTicket = issueTicket(
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: "smoke-fresh",
        antidetectProfileId: "smoke-profile",
        proxyLabel: "smoke-proxy",
        proxy: { protocol: "http", host: "127.0.0.1", port: 1080 },
      },
      { deviceId: DEVICE_ID, publicKey: devicePublicKey },
    );
    const freshResult = await relayCall(RELAY_PATHS.ticket, { ticket: freshTicket });
    check(
      "vé mới sau restart đi qua xác minh đúng một lần",
      freshResult.ok === false && !String(freshResult.rejectionCode ?? ""),
      String(freshResult.message).slice(0, 70),
    );
    const freshReplay = await relayCall(RELAY_PATHS.ticket, { ticket: freshTicket });
    check("vé mới cũng bị chặn khi dùng lại", freshReplay.rejectionCode === "ALREADY_USED");

    const freshCredential = issueTicket(
      {
        kind: TICKET_KINDS.CREDENTIAL,
        accountId: "smoke-fresh-secret",
        field: "password",
        credentialCiphertext: encryptCredential(PASSWORD, vaultKeyOperator),
      },
      { deviceId: DEVICE_ID, publicKey: devicePublicKey },
    );
    const freshSecret = await relayCall(SECRET_REVEAL_PATH, { ticket: freshCredential });
    check(
      "vé bí mật mới sau restart hoàn tất thành công",
      freshSecret.ok === true && freshSecret.secret === PASSWORD,
      String(freshSecret.message),
    );

    console.log("Lượt 5 — forced termination rồi restart");
    relay.forceStop();
    await relay.waitForExit();
    relay = await startRelay(home, candidate.executablePath);
    const replayAfterCrash = await relayCall(SECRET_REVEAL_PATH, { ticket: freshCredential });
    check(
      "vé đã tiêu vẫn bị chặn sau forced termination",
      replayAfterCrash.rejectionCode === "ALREADY_USED",
      String(replayAfterCrash.message),
    );

    // Corrupting the committed journal must make the exact candidate report not-ready, never reset
    // the replay set. Restore the bytes before continuing the remainder of the smoke flow.
    const journalPath = path.join(home, SPENT_TICKET_JOURNAL_FILE);
    const journalBytes = readFileSync(journalPath);
    relay.stop();
    await relay.waitForExit();
    writeFileSync(journalPath, "[{\"jti\":", "utf8");
    relay = await startRelay(home, candidate.executablePath);
    const corruptHealth = await relayCall(RELAY_PATHS.health);
    check("journal hỏng làm Relay không sẵn sàng", corruptHealth.ok === false, String(corruptHealth.message));
    relay.stop();
    await relay.waitForExit();
    writeFileSync(journalPath, journalBytes);
    relay = await startRelay(home, candidate.executablePath);

    const expired = issueTicket(
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: "smoke",
        antidetectProfileId: "smoke-profile",
        proxyLabel: "smoke-proxy",
        proxy: { protocol: "http", host: "127.0.0.1", port: 1080 },
      },
      { deviceId: DEVICE_ID, publicKey: devicePublicKey },
      // Expired by a whole lifetime, not by one millisecond. `exp` is computed here and compared
      // against `Date.now()` inside a separate process, so the old `- 1` made this a wall-clock
      // race: any backward clock step between the two reads left the ticket still valid, it then
      // passed verification and died at browser launch instead — which returns no rejection code
      // at all, so the check failed with nothing to explain it. Self-hosted runners are virtual
      // machines and virtual machines step their clocks; CI run 32947403735 is what that looks
      // like. The exact boundary is asserted in `ticket-lifecycle.test.ts` against an injected
      // clock, which is the only place that comparison is deterministic enough to be worth making.
      Date.now() - TICKET_LIFETIME_MS * 2,
    );
    // Every other check here reports what it saw. This one asserts on `rejectionCode`, so a bare
    // FAIL cannot distinguish "accepted an expired ticket" from "rejected it for another reason" —
    // report the code and message so one red run is enough to tell them apart.
    const expiredResult = await relayCall(RELAY_PATHS.ticket, { ticket: expired });
    check(
      "vé quá hạn bị chặn",
      expiredResult.rejectionCode === "EXPIRED",
      `${String(expiredResult.rejectionCode ?? "khong co ma")} — ${String(expiredResult.message)}`,
    );

    console.log("\nVé bí mật — vòng trọn vẹn, kho tới màn hình");

    /**
     * **Hai vé riêng, không dùng lại một tấm.** `verifyTicket` tiêu vé **trước** khi kiểm loại
     * vé, nên tấm bị `/ticket` từ chối cũng đã cháy — đúng hành vi cần có (hỏng thì hỏng theo
     * hướng đóng), nhưng nó làm phép kiểm dùng chung một vé đỏ vì lý do chẳng liên quan gì.
     */
    const credentialTicket = () =>
      issueTicket(
        {
          kind: TICKET_KINDS.CREDENTIAL,
          accountId: "smoke",
          field: "password",
          // Đúng thứ nằm trong cột `Account.passwordEnc`: máy chủ chuyển tiếp ciphertext chứ
          // không mở ra — nó không có khóa vùng operator.
          credentialCiphertext: encryptCredential(PASSWORD, vaultKeyOperator),
        },
        { deviceId: DEVICE_ID, publicKey: devicePublicKey },
      );

    check(
      "vé bí mật KHÔNG đi được đường /ticket (QĐ 3)",
      (await relayCall(RELAY_PATHS.ticket, { ticket: credentialTicket() })).ok === false,
    );

    const revealed = await relayCall(SECRET_REVEAL_PATH, { ticket: credentialTicket() });
    check(
      "mật khẩu ra đúng nguyên văn chuỗi đã gửi đi",
      revealed.ok === true && revealed.secret === PASSWORD,
      revealed.ok === true ? "" : String(revealed.message),
    );

    console.log("\nRetirement — packaged cleanup, recovery receipt, and finalization");
    const retirementId = randomUUID();
    const retirementProof = randomBytes(32).toString("base64url");
    const retirementCompletion = sealForDevice({ proof: retirementProof }, devicePublicKey);
    const finalizationSeed = randomBytes(32);
    const finalizationKeys = signingKeysFromSeed(finalizationSeed);
    const retirementAuthorization = issueDeviceRetirementAuthorization(
      {
        authorizationId: randomUUID(),
        retirementId,
        deviceId: DEVICE_ID,
        recipientPublicKey: devicePublicKey,
        completionHash: hashDeviceRetirementProof(retirementProof),
        completionEphemeralPublicKey: retirementCompletion.ephemeralPublicKey,
        completionSealed: retirementCompletion.sealed,
        finalizationPublicKey: publicKeyToHex(finalizationKeys.publicKey),
      },
      serverKeys.privateKey,
      Date.now(),
      30_000,
    );
    const retired = await relayCall(
      RELAY_PATHS.retireDevice,
      { authorization: retirementAuthorization },
      { origin: bakedOrigin },
    );
    check(
      "removes packaged Relay identity and returns the recipient proof",
      retired.ok === true &&
        retired.retirementId === retirementId &&
        retired.proof === retirementProof &&
        retired.cleanupComplete === true,
      String(retired.message),
    );
    const pending = await relayCall(RELAY_PATHS.health);
    check(
      "enters fail-closed retirement recovery",
      pending.ok === false && pending.retirementPending === true && pending.deviceId === DEVICE_ID,
      String(pending.message),
    );
    const finalization = issueDeviceRetirementFinalization(
      {
        authorizationId: randomUUID(),
        retirementId,
        deviceId: DEVICE_ID,
        recipientPublicKey: devicePublicKey,
        completionHash: hashDeviceRetirementProof(retirementProof),
      },
      finalizationKeys.privateKey,
      Date.now(),
    );
    const finalized = await relayCall(
      RELAY_PATHS.finalizeDeviceRetirement,
      { authorization: finalization },
      { origin: bakedOrigin },
    );
    check("accepts only the matching finalization and closes", finalized.ok === true, String(finalized.message));
  } catch (error) {
    console.error(`\nĐỏ giữa chừng: ${(error as Error).message}`);
    console.error(relay.output());
    failures++;
  } finally {
    relay.stop();
    removeTempHome(home);
    removeTempHome(candidate.stagingDir);
  }

  console.log(
    failures === 0
      ? "\n✅ .exe chạy đúng: mật mã nguyên vẹn sau khi đóng gói, ba loại vé hỏng đều bị chặn.\n"
      : `\n❌ ${failures} phép kiểm đỏ.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void run();
