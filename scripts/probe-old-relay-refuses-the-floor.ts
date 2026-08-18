/**
 * Does a **real, previously-shipped** Relay binary refuse a ticket that sits above its version, and
 * does it say something the operator can act on?
 *
 * Chạy: `npx tsx scripts/probe-old-relay-refuses-the-floor.ts <đường-dẫn-tới-.exe-cũ>`
 *
 * ## Vì sao cần bài này khi đã có test đơn vị cho đúng phép so sánh đó
 *
 * Test đơn vị chạy verifier trong **cây mã hiện tại**. Thứ đang chạy trên máy operator là một
 * binary biên dịch từ nhiều tuần trước, mang **bản sao verifier của riêng nó**. Ngày 18/08/2026
 * `MIN_RELAY_VERSION` được nâng lên 13 và chặn toàn bộ đội — một quyết định dựa trên giả định rằng
 * những binary cũ đó từ chối một cách sạch sẽ và nói ra được lý do.
 *
 * Đọc mã thì thấy phép kiểm có mặt từ `d7f5acd`, tức trước mọi bản còn giữ lại. Nhưng "đọc mã thấy
 * đúng" chính là loại khẳng định đã sai nhiều lần trong đợt audit này. Chỉ có binary mới chứng minh
 * được, và các bản v9–v12 vẫn còn trong `MKTBrowser/apps/desktop/.relay-payload/`.
 *
 * ## Nó chứng minh cái gì, và KHÔNG chứng minh cái gì
 *
 * Chứng minh: một cầu nối dưới sàn từ chối vé, và câu từ chối nêu cả bản nó đang chạy lẫn bản cần
 * có. Đó là điều kiện đạt mà gate 3 đòi ở phần "refusal names a reason an operator can act on".
 *
 * KHÔNG chứng minh H54 như nguyên văn — *`compatibility-installer-floor` có thể bị thỏa mãn từ
 * dưới lên hay không*. Câu đó nói về sàn **bộ cài** trên một máy sạch, là chuyện khác, và vẫn cần
 * máy ảo. Đừng để bài này thay thế cho gate đó.
 *
 * Tự chứa: tự sinh khóa ký dùng một lần, dùng thư mục tạm, không chạm production.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { RELAY_ORIGIN, RELAY_PATHS } from "../src/lib/relay/relay-endpoints";
import {
  publicKeyToHex,
  resetServerSigningKeysCache,
  signingKeysFromSeed,
} from "../src/lib/tickets/server-signing-key";
import { issueTicket } from "../src/lib/tickets/ticket-issuer";
import { issueGrantAuthorization } from "../src/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof } from "../src/lib/relay/enrollment/grant-digests";
import { sealForDevice } from "../src/lib/tickets/ticket-sealed-box";
import {
  MIN_RELAY_VERSION,
  TICKET_KINDS,
  effectiveMinRelayVersion,
} from "../src/lib/tickets/ticket-types";

const EXE = process.argv[2];

async function call(p: string, body?: unknown, origin?: string) {
  const res = await fetch(`${RELAY_ORIGIN}${p}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as Record<string, unknown>;
}

async function run() {
  if (!EXE) {
    console.error("\nKhai đường dẫn tới một .exe cầu nối cũ, ví dụ một bản giải nén từ");
    console.error("MKTBrowser/apps/desktop/.relay-payload/MKTTool-Relay-v12.zip\n");
    process.exit(1);
  }

  // Khóa ký dùng một lần. Không đụng khóa thật, và cũng không cần: bài này đo phép kiểm phiên bản,
  // thứ chạy TRƯỚC khi chữ ký có ý nghĩa gì với kết quả.
  const seed = randomBytes(32);
  process.env.TICKET_SIGNING_KEY = seed.toString("hex");
  resetServerSigningKeysCache();
  const keys = signingKeysFromSeed(seed);

  const home = mkdtempSync(path.join(tmpdir(), "relay-floor-probe-"));
  const child: ChildProcess = spawn(EXE, [], {
    env: { ...process.env, RELAY_HOME: home },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (c: Buffer) => (log += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (log += c.toString()));

  try {
    let health: Record<string, unknown> | null = null;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && health === null) {
      try {
        health = await call(RELAY_PATHS.health);
      } catch {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!health) throw new Error(`Cầu nối không mở cổng:\n${log}`);

    const reported = health.relayVersion as number;
    const floor = effectiveMinRelayVersion(TICKET_KINDS.CREDENTIAL);
    console.log(`\nBinary khai              : bản ${reported}`);
    console.log(`Sàn máy chủ đang đòi     : ${MIN_RELAY_VERSION} (vé credential: ${floor})`);

    if (reported >= floor) {
      console.error(`\nBản này KHÔNG dưới sàn, nên bài đo sẽ vô nghĩa. Dùng một .exe cũ hơn.\n`);
      process.exit(1);
    }

    const configured = await call(
      RELAY_PATHS.configure,
      { deviceId: "probe-device", serverPublicKey: publicKeyToHex(keys.publicKey) },
      String(health.webOrigin),
    );
    console.log(`Cấu hình                 : ok=${configured.ok}`);

    /**
     * **Phải đưa cầu nối tới trạng thái SẴN SÀNG trước khi đo, và đây là chỗ bài này suýt nói dối.**
     *
     * Lượt chạy đầu bỏ qua bước dán khóa operator. Cầu nối vẫn từ chối tấm vé — nhưng vì *"chưa
     * cấu hình xong"*, không phải vì sàn phiên bản: phép kiểm cấu hình chạy trước và bắn trước.
     * Kết quả trông như một lần từ chối thành công trong khi phép kiểm đang đo hoàn toàn không
     * phải thứ nó tuyên bố đo. Máy của operator thật thì đã cấu hình đủ, nên muốn đo đúng cái họ
     * gặp thì phải dựng lại đúng trạng thái đó.
     */
    // Bootstrap trước, rồi mới dán khóa: v12 không nhận khóa operator khi chưa có ủy quyền của
    // máy chủ. Cùng trình tự mà `smoke-test-relay-executable.ts` dùng.
    const authorizationId = randomUUID();
    const proof = randomBytes(32).toString("base64url");
    const completion = sealForDevice({ proof }, String(health.publicKey));
    await call(
      RELAY_PATHS.authorizeBootstrap,
      {
        authorization: issueGrantAuthorization(
          {
            kind: "bootstrap",
            authorizationId,
            deviceId: "probe-device",
            recipientPublicKey: String(health.publicKey),
            grantId: authorizationId,
            generation: 1,
            grantHash: createHash("sha256").update(`bootstrap
${authorizationId}`).digest("hex"),
            completionHash: hashGrantCompletionProof(proof),
            completionEphemeralPublicKey: completion.ephemeralPublicKey,
            completionSealed: completion.sealed,
          },
          keys.privateKey,
          Date.now(),
          300_000,
        ),
      },
      String(health.webOrigin),
    );
    await call(
      RELAY_PATHS.setOperatorKey,
      { vaultKeyOperator: randomBytes(32).toString("hex") },
      RELAY_ORIGIN,
    );
    const ready = await call(RELAY_PATHS.health);
    console.log(`Sẵn sàng                 : ok=${ready.ok} ${ready.ok ? "" : String(ready.message).slice(0, 60)}`);
    if (ready.ok !== true) {
      console.error(`\nChưa đưa được cầu nối tới trạng thái sẵn sàng, nên phép đo bên dưới sẽ đo`);
      console.error(`nhầm một lần từ chối vì lý do khác. Dừng ở đây thay vì báo một kết quả sai.\n`);
      process.exitCode = 1;
      return;
    }

    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.CREDENTIAL,
        accountId: "probe",
        field: "password",
        credentialCiphertext: "x",
      },
      { deviceId: "probe-device", publicKey: String(health.publicKey) },
    );
    const envelope = JSON.parse(
      Buffer.from(ticket.split(".")[0], "base64url").toString("utf8"),
    ) as { minRelayVersion: number };
    console.log(`Vé mang minRelayVersion  : ${envelope.minRelayVersion}`);

    const result = await call(RELAY_PATHS.ticket, { ticket });
    console.log(`\n--- điều operator nhìn thấy ---`);
    console.log(`ok      : ${result.ok}`);
    console.log(`message : ${result.message}`);

    const message = String(result.message);
    const refused = result.ok === false;
    // Câu từ chối phải nêu CẢ hai con số. Một câu "bản cầu nối quá cũ" trống không thì đúng mà vô
    // dụng: người đọc không biết mình đang ở đâu và cần tới đâu.
    const namesBoth =
      message.includes(String(reported)) && message.includes(String(envelope.minRelayVersion));

    console.log(`\nTừ chối                  : ${refused ? "CÓ" : "KHÔNG — sàn không giữ"}`);
    console.log(`Nêu cả hai con số        : ${namesBoth ? "có" : "không"}`);
    console.log(
      refused && namesBoth
        ? `\n✅ Bản ${reported} bị chặn sạch và câu từ chối dùng được.\n`
        : `\n❌ Sàn không hành xử như giả định của quyết định nâng sàn.\n`,
    );
    process.exitCode = refused && namesBoth ? 0 : 1;
  } finally {
    child.kill();
    rmSync(home, { recursive: true, force: true });
  }
}

void run();
