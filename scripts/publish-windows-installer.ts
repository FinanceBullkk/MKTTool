/**
 * Đẩy gói cài MKT Browser lên ngăn phát hành trên R2.
 *
 * Chạy: `npm run browser:publish -- --file=<.exe> --version=<số hiệu> --candidate-id=<id> --relay-version=<bản cầu nối> --provenance-file=<release-provenance.json> --release-manifest=<frozen-manifest.json>`
 *
 * ## Vì sao là lệnh riêng, không nối vào bộ build của MKTBrowser
 *
 * Cùng lý lẽ với `relay:publish`: build là việc làm nhiều lần kể cả để thử, còn phát hành là việc
 * **cả team nhìn thấy** — nó đổi thứ mọi người tải về. Hai việc có hậu quả khác nhau tới thế thì
 * không nên chung một nút. Thêm một lý do riêng ở đây: `.exe` dựng trong repo MKTBrowser còn ngăn
 * phát hành là của MKTTool, nên nối tự động sẽ bắt repo kia cầm chìa ghi.
 *
 * ## Chìa ghi nằm ở máy phát hành, không lên máy chủ
 *
 * Máy chủ chỉ **đọc** ngăn này. Chìa ghi ở `.env` của máy quản trị viên và không đi đâu khác.
 *
 * ## Con trỏ ổn định có chủ ý
 *
 * Khoá ổn định hiện vẫn giữ tương thích với client cũ nên publish là ghi đè. Đó là một rủi ro
 * phát hành được ghi rõ, không phải một đặc tính bất biến: Phase 4 phải thêm manifest/pointer có
 * xác thực trước khi cho phép phân phối rộng. Script này luôn kiểm provenance đầy đủ và đọc lại
 * toàn bộ bytes sau khi ghi; không được coi một HEAD thành công là bằng chứng phát hành.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getObject, headObject, putObject } from "../src/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV } from "../src/lib/r2/r2-config";
import { CHECKSUM_METADATA_KEY } from "../src/lib/relay/relay-release-r2";
import { formatFileSize } from "../src/lib/relay/relay-release-file";
import {
  WINDOWS_INSTALLER_METADATA_KEYS,
  WINDOWS_INSTALLER_R2_KEY,
  WINDOWS_INSTALLER_RELAY_VERSION_METADATA_KEY,
  WINDOWS_INSTALLER_VERSION_METADATA_KEY,
  EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID,
  EXPECTED_WINDOWS_INSTALLER_VERSION,
} from "../src/lib/setup/windows-installer-release";
import { parseWindowsInstallerReleaseMetadata } from "../src/lib/setup/windows-installer-release-metadata";
import { WINDOWS_INSTALLER_FILE_NAME } from "../src/lib/setup/windows-installer-file";
import { MIN_RELAY_VERSION } from "../src/lib/tickets/ticket-types";

function flag(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const filePath = flag("file")?.trim();
  const version = flag("version")?.trim();
  const candidateId = flag("candidate-id")?.trim();
  const relayVersionRaw = flag("relay-version")?.trim();
  const provenancePath = flag("provenance-file")?.trim();
  const releaseManifestPath = flag("release-manifest")?.trim();

  if (!filePath || !version || !candidateId || !relayVersionRaw || !provenancePath || !releaseManifestPath) {
    console.error(
      "\nThiếu tham số.\n\n" +
        "  npm run browser:publish -- --file=<đường dẫn .exe> --version=<số hiệu> " +
        "--candidate-id=<candidate trong manifest> --relay-version=<bản cầu nối trong ruột> " +
        "--provenance-file=<release-provenance.json> --release-manifest=<frozen-manifest.json>\n\n" +
        "Số hiệu là thứ hiện trên trang chuẩn bị để người cài biết mình đang tải bản nào —\n" +
        "lấy đúng version của bản vừa dựng bên MKTBrowser, đừng tự đặt.\n\n" +
        "--relay-version là bản cầu nối gói này MANG SẴN, đọc ở `apps/desktop/relay-release.json`\n" +
        "bên MKTBrowser. Bắt buộc, vì thiếu nó thì trang chuẩn bị phải dặn thận trọng mãi mãi và\n" +
        "người cài phải làm một bước thừa ở mỗi lần cài.\n",
    );
    process.exit(1);
  }

  const relayVersion = Number(relayVersionRaw);
  if (!Number.isSafeInteger(relayVersion) || relayVersion <= 0) {
    console.error(`\n--relay-version phải là số nguyên dương, nhận được "${relayVersionRaw}".\n`);
    process.exit(1);
  }

  if (relayVersion !== 16) {
    console.error(`\nOnly the coordinated Relay v16 candidate may be published (received v${relayVersion}).\n`);
    process.exit(1);
  }
  if (version !== EXPECTED_WINDOWS_INSTALLER_VERSION) {
    console.error(
      `\nOnly Browser ${EXPECTED_WINDOWS_INSTALLER_VERSION} may be published in this freeze (received ${version}).\n`,
    );
    process.exit(1);
  }
  if (candidateId !== EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID) {
    console.error(
      `\nCandidate ID does not match the frozen tuple (${EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID}).\n`,
    );
    process.exit(1);
  }

  // Chốt chặn dựng lên từ lỗi tệ nhất của đợt pilot 18/08/2026: MKT Browser 0.3.1 mang cầu nối bản
  // 12 trong khi sàn đã lên 13, nên mọi máy cài xong đều bị từ chối — và đường phát hành đi ngang
  // qua đây mà không hề biết. Nay nó biết, và nó dừng lại.
  if (relayVersion < MIN_RELAY_VERSION) {
    console.error(
      `\n⛔ Gói này mang cầu nối bản ${relayVersion}, dưới sàn ${MIN_RELAY_VERSION} máy chủ đang đòi.\n\n` +
        "Máy nào cài xong cũng bị từ chối mọi tấm vé, và cài một cầu nối mới TRƯỚC cũng không cứu\n" +
        "được — lần cài trình duyệt kế tiếp lại kéo nó xuống. Ghim lại payload rồi dựng lại gói.\n\n" +
        "KHÔNG phát hành.\n",
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  let body: Buffer;
  try {
    // Read once, then derive both size and digest from those exact bytes. A separate stat followed
    // by a later read permits a concurrent packaging process to replace/truncate the EXE after the
    // preflight and before the irreversible R2 write.
    body = readFileSync(resolved);
  } catch {
    console.error(`\nKhông đọc được file: ${resolved}\n`);
    process.exit(1);
  }
  const sizeBytes = body.length;
  if (path.basename(resolved) !== WINDOWS_INSTALLER_FILE_NAME) {
    throw new Error(`The installer filename must be exactly ${WINDOWS_INSTALLER_FILE_NAME}.`);
  }
  if (body.length < 64 || body.subarray(0, 2).toString("ascii") !== "MZ") {
    throw new Error("The selected file is not a Windows PE installer.");
  }
  const sha256 = createHash("sha256").update(body).digest("hex");
  const frozenTuple = readFrozenReleaseTuple(releaseManifestPath);
  if (
    sha256 !== frozenTuple.installerSha256 ||
    sizeBytes !== frozenTuple.installerSizeBytes
  ) {
    throw new Error(
      "The selected installer bytes do not match the frozen release-manifest hash/size tuple.",
    );
  }

  const config = readR2Config(process.env, RELAY_RELEASE_R2_ENV);
  if (!config) {
    console.error(
      "\nChưa khai ngăn phát hành. Cần đủ bốn biến RELAY_RELEASE_R2_* trong .env của máy này.\n",
    );
    process.exit(1);
  }

  // The legacy fixed Browser key is not an immutable release channel. Refuse to overwrite an
  // existing object until Phase 4 supplies a versioned object plus an authenticated pointer and
  // revocation record. This keeps a seemingly successful local command from destroying rollback
  // evidence or racing the setup reader.
  const existing = await headObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
  if (existing) {
    throw new Error(
      `The legacy mutable Browser installer key already exists (${formatFileSize(existing.sizeBytes)}); ` +
        "immutable versioned publication and an authenticated pointer are required before replacement.",
    );
  }

  const metadata = readInstallerMetadata(provenancePath, frozenTuple);
  const parsedMetadata = parseWindowsInstallerReleaseMetadata(metadata);
  if (!parsedMetadata.metadataComplete) {
    throw new Error(
      `Provenance metadata is incomplete or malformed: ${parsedMetadata.metadataMissing.join(", ")}.`,
    );
  }

  console.log(`Đang đẩy ${path.basename(resolved)} — ${formatFileSize(sizeBytes)}`);
  console.log(`  bản        ${version}`);
  console.log(`  cầu nối    ${relayVersion} (sàn hiện tại ${MIN_RELAY_VERSION})`);
  console.log(`  SHA-256    ${sha256}`);

  const publishedMetadata = {
    [CHECKSUM_METADATA_KEY]: sha256,
    [WINDOWS_INSTALLER_VERSION_METADATA_KEY]: version,
    [WINDOWS_INSTALLER_RELAY_VERSION_METADATA_KEY]: String(relayVersion),
    ...metadata,
  };
  await putObject({
    config,
    key: WINDOWS_INSTALLER_R2_KEY,
    body,
    contentType: "application/vnd.microsoft.portable-executable",
    metadata: publishedMetadata,
    ifNoneMatch: "*",
  });

  // Đọc lại từ ngăn thay vì tin lệnh ghi đã xong: cùng lý lẽ với mọi phép kiểm khác trong kho này
  // — thứ chứng minh là cái đọc được ở đầu kia, không phải cái mình vừa gửi đi.
  const written = await headObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
  const metadataMismatch = !written
    ? "object missing"
    : Object.entries(publishedMetadata).find(
        ([key, value]) => written.metadata[key.toLowerCase()] !== value,
      )?.[0];
  if (metadataMismatch) {
    console.error("\nĐẩy xong nhưng đọc lại không khớp mã băm. KHÔNG coi là đã phát hành.\n");
    process.exit(1);
  }

  await verifyRemoteBytes(config, WINDOWS_INSTALLER_R2_KEY, sizeBytes, sha256);

  console.log(`\n✅ Đã phát hành. Trang /setup sẽ hiện bản ${version} ngay lần tải lại.`);
}

type FrozenReleaseTuple = {
  candidateId: string;
  version: string;
  relayVersion: number;
  installerSha256: string;
  installerSizeBytes: number;
  sourceSha: string;
  sourceTree: string;
  engineKind: string;
  engineChannel: string;
  engineVersion: string;
  engineSha256: string;
  payloadManifestSha256: string;
  payloadFileCount: number;
  relaySha256: string;
  relaySizeBytes: number;
  signingStatus: "authenticode" | "unsigned-internal-exception";
  signingExceptionExpiresAt: string | null;
};

function readInstallerMetadata(
  provenancePath: string,
  expected: FrozenReleaseTuple,
): Record<string, string> {
  let provenance: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.resolve(provenancePath), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("provenance root must be an object");
    }
    provenance = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Không đọc được provenance của gói cài: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const source = asObject(provenance.source);
  const product = asObject(provenance.product);
  const installer = asObject(provenance.installer);
  const relay = asObject(provenance.relay);
  const engine = asObject(provenance.engine);
  const signing = asObject(provenance.signing);
  const sourceCommit = source.commit;
  const sourceTree = source.tree;
  const candidateId = provenance.candidateId;
  const productVersion = product.version;
  const signingStatus = resolveSigningStatus(signing);
  const signingExceptionExpiresAt = resolveSigningExceptionExpiry(signing);
  if (provenance.schemaVersion !== 1 || provenance.type !== "mktbrowser.release-provenance") {
    throw new Error("Provenance schema/type is not supported.");
  }
  if (source.clean !== true) {
    throw new Error("Provenance source.clean must be true; dirty source cannot be published.");
  }
  const payload = asObject(provenance.payload);
  if (!/^[a-f0-9]{64}$/i.test(asString(payload.manifestSha256) ?? "")) {
    throw new Error("Provenance payload manifest SHA-256 is missing or invalid.");
  }
  if (!Number.isSafeInteger(payload.fileCount) || Number(payload.fileCount) <= 0) {
    throw new Error("Provenance payload file count is missing or invalid.");
  }
  const values: Record<string, string | undefined> = {
    [WINDOWS_INSTALLER_METADATA_KEYS.candidateId]: asString(candidateId),
    [WINDOWS_INSTALLER_METADATA_KEYS.browserVersion]: asString(productVersion),
    [WINDOWS_INSTALLER_METADATA_KEYS.installerSha256]: asString(installer.installerSha256),
    [WINDOWS_INSTALLER_METADATA_KEYS.bundledRelayVersion]:
      relay.version === undefined ? undefined : String(relay.version),
    [WINDOWS_INSTALLER_METADATA_KEYS.bundledRelaySha256]: asString(relay.sha256),
    [WINDOWS_INSTALLER_METADATA_KEYS.payloadManifestSha256]: asString(payload.manifestSha256),
    [WINDOWS_INSTALLER_METADATA_KEYS.payloadFileCount]: asString(payload.fileCount),
    [WINDOWS_INSTALLER_METADATA_KEYS.browserSourceSha]: asString(sourceCommit),
    [WINDOWS_INSTALLER_METADATA_KEYS.browserSourceTree]: asString(sourceTree),
    [WINDOWS_INSTALLER_METADATA_KEYS.engineKind]: asString(engine.engineKind ?? engine.kind),
    [WINDOWS_INSTALLER_METADATA_KEYS.engineChannel]: asString(engine.source ?? engine.channel),
    [WINDOWS_INSTALLER_METADATA_KEYS.engineVersion]: asString(engine.version),
    [WINDOWS_INSTALLER_METADATA_KEYS.engineSha256]: asString(engine.sha256),
    [WINDOWS_INSTALLER_METADATA_KEYS.signingStatus]: signingStatus,
    [WINDOWS_INSTALLER_METADATA_KEYS.signingExceptionExpiresAt]:
      signingExceptionExpiresAt,
  };

  const missing = Object.entries(values).filter(([, value]) => !value || !String(value).trim());
  if (missing.length > 0) {
    throw new Error(`Provenance thiếu metadata bắt buộc: ${missing.map(([key]) => key).join(", ")}.`);
  }

  if (candidateId !== expected.candidateId) {
    throw new Error(`Provenance candidate ${candidateId} không khớp --candidate-id ${expected.candidateId}.`);
  }
  if (productVersion !== expected.version) {
    throw new Error(`Provenance version ${productVersion} không khớp --version ${expected.version}.`);
  }
  if (
    Number(relay.version) !== expected.relayVersion ||
    Number(relay.sizeBytes) !== expected.relaySizeBytes
  ) {
    throw new Error(
      `Provenance Relay v${relay.version}/${relay.sizeBytes} bytes does not match the frozen ` +
        `v${expected.relayVersion}/${expected.relaySizeBytes}-byte tuple.`,
    );
  }
  if (expected.relayVersion !== 16) {
    throw new Error("The publisher is locked to the coordinated Relay v16 candidate.");
  }
  if (expected.version !== EXPECTED_WINDOWS_INSTALLER_VERSION) {
    throw new Error(`The publisher is locked to Browser ${EXPECTED_WINDOWS_INSTALLER_VERSION}.`);
  }
  if (expected.candidateId !== EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID) {
    throw new Error(`The candidate ID is not the frozen ${EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID}.`);
  }
  if (installer.installerSha256 !== expected.installerSha256 || installer.sizeBytes !== expected.installerSizeBytes) {
    throw new Error("Provenance installer hash/size không khớp bytes đang phát hành.");
  }
  if (!/^[a-f0-9]{40}$/i.test(String(sourceCommit)) || !/^[a-f0-9]{40}$/i.test(String(sourceTree))) {
    throw new Error("Provenance source commit/tree phải là SHA-1 dạng hex.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(installer.installerSha256)) || !/^[a-f0-9]{64}$/i.test(String(relay.sha256))) {
    throw new Error("Provenance installer/Relay checksum không hợp lệ.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(engine.sha256))) {
    throw new Error("Provenance engine checksum không hợp lệ.");
  }
  const actualSourceSha = String(sourceCommit).toLowerCase();
  const actualSourceTree = String(sourceTree).toLowerCase();
  const actualEngineKind = String(engine.engineKind ?? engine.kind);
  const actualEngineChannel = String(engine.source ?? engine.channel);
  const actualEngineVersion = String(engine.version);
  const actualEngineSha256 = String(engine.sha256).toLowerCase();
  const actualPayloadManifestSha256 = String(payload.manifestSha256).toLowerCase();
  const actualPayloadFileCount = Number(payload.fileCount);
  const actualRelaySha256 = String(relay.sha256).toLowerCase();
  if (
    actualSourceSha !== expected.sourceSha ||
    actualSourceTree !== expected.sourceTree ||
    actualEngineKind !== expected.engineKind ||
    actualEngineChannel !== expected.engineChannel ||
    actualEngineVersion !== expected.engineVersion ||
    actualEngineSha256 !== expected.engineSha256 ||
    actualPayloadManifestSha256 !== expected.payloadManifestSha256 ||
    actualPayloadFileCount !== expected.payloadFileCount ||
    actualRelaySha256 !== expected.relaySha256 ||
    signingStatus !== expected.signingStatus ||
    signingExceptionExpiresAt !== expected.signingExceptionExpiresAt
  ) {
    throw new Error("Provenance does not match the frozen release-manifest tuple.");
  }
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      String(value).trim().toLowerCase() === "authenticode" ? "authenticode" : String(value).trim(),
    ]),
  );
}

/** Read the signed/frozen cross-repository tuple before any R2 mutation is possible. */
function readFrozenReleaseTuple(filePath: string): FrozenReleaseTuple {
  let manifest: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.resolve(filePath), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("release manifest root must be an object");
    }
    manifest = parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Could not read the frozen release manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!(["frozen", "signed", "published"] as unknown[]).includes(manifest.status)) {
    throw new Error("The release manifest is not frozen/signed; refusing publication.");
  }
  if (manifest.candidateId !== EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID) {
    throw new Error("The release manifest candidate ID does not match the frozen candidate.");
  }
  const browser = asObject(manifest.mktBrowser);
  const installer = asObject(manifest.installer);
  const build = asObject(manifest.buildEvidence);
  const relay = asObject(manifest.relay);
  const engine = asObject(manifest.engine);
  const sourceSha = requiredHex(browser.sourceSha, 40, "mktBrowser.sourceSha");
  const sourceTree = requiredHex(browser.treeSha, 40, "mktBrowser.treeSha");
  const engineSha256 = requiredHex(engine.sha256, 64, "engine.sha256");
  const payloadManifestSha256 = requiredHex(build.payloadManifestSha256, 64, "buildEvidence.payloadManifestSha256");
  const relaySha256 = requiredHex(relay.archiveSha256, 64, "relay.archiveSha256");
  const relaySizeBytes = requiredPositiveInteger(
    relay.archiveSizeBytes,
    "relay.archiveSizeBytes",
  );
  const payloadFileCount = requiredPositiveInteger(build.payloadFileCount, "buildEvidence.payloadFileCount");
  const installerSha256 = requiredHex(installer.sha256, 64, "installer.sha256");
  const installerSizeBytes = requiredPositiveInteger(installer.sizeBytes, "installer.sizeBytes");
  if (installerSha256.length !== 64 || installerSizeBytes <= 0) {
    throw new Error("The release manifest installer tuple is invalid.");
  }
  if (relay.targetVersion !== 16 || engine.version !== "151.0.7922.108.2") {
    throw new Error("The release manifest does not target the coordinated v16/Stable .2 tuple.");
  }
  const signingStatus = requiredSigningStatus(installer.signingStatus);
  const signingExceptionExpiresAt =
    signingStatus === "unsigned-internal-exception"
      ? requiredFutureIsoInstant(
          installer.signingExceptionExpiresAt,
          "installer.signingExceptionExpiresAt",
        )
      : null;
  return {
    sourceSha,
    sourceTree,
    engineKind: requiredSafeText(engine.kind, "engine.kind"),
    engineChannel: requiredSafeText(engine.channel, "engine.channel"),
    engineVersion: requiredSafeText(engine.version, "engine.version"),
    engineSha256,
    payloadManifestSha256,
    payloadFileCount,
    relaySha256,
    relaySizeBytes,
    signingStatus,
    signingExceptionExpiresAt,
    candidateId: manifest.candidateId as string,
    version: requiredSafeText(installer.version, "installer.version"),
    relayVersion: 16,
    installerSha256,
    installerSizeBytes,
  };
}

function requiredHex(value: unknown, length: 40 | 64, label: string): string {
  const text = typeof value === "string" ? value.toLowerCase() : "";
  if (!new RegExp(`^[a-f0-9]{${length}}$`).test(text)) throw new Error(`Invalid ${label} in release manifest.`);
  return text;
}

function requiredPositiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`Invalid ${label} in release manifest.`);
  return Number(value);
}

function requiredSafeText(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value.trim())) {
    throw new Error(`Invalid ${label} in release manifest.`);
  }
  return value.trim();
}

function requiredSigningStatus(
  value: unknown,
): "authenticode" | "unsigned-internal-exception" {
  if (value === "authenticode" || value === "unsigned-internal-exception") return value;
  throw new Error("Invalid installer.signingStatus in release manifest.");
}

function requiredFutureIsoInstant(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Invalid ${label} in release manifest.`);
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new Error(`Invalid or expired ${label} in release manifest.`);
  }
  return new Date(timestamp).toISOString();
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resolveSigningStatus(signing: Record<string, unknown>): string | undefined {
  if (typeof signing.authenticode !== "boolean") return undefined;
  if (signing.authenticode) {
    // A JSON provenance claim is not a certificate chain. Until this publisher invokes an
    // Authenticode verifier and binds the signer/thumbprint, never let a hand-edited record turn
    // an unsigned EXE into a trusted release.
    return undefined;
  }
  if (signing.status !== "unsigned-internal-exception") return undefined;
  if (!resolveSigningExceptionExpiry(signing)) return undefined;
  if (!Array.isArray(signing.allowedLanes) || !signing.allowedLanes.includes("A") || !signing.allowedLanes.includes("B")) {
    return undefined;
  }
  return "unsigned-internal-exception";
}

function resolveSigningExceptionExpiry(
  signing: Record<string, unknown>,
): string | undefined {
  if (signing.status !== "unsigned-internal-exception") return undefined;
  if (typeof signing.exceptionExpiresAt !== "string") return undefined;
  const expiresAt = Date.parse(signing.exceptionExpiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
  return new Date(expiresAt).toISOString();
}

async function verifyRemoteBytes(
  config: NonNullable<ReturnType<typeof readR2Config>>,
  key: string,
  expectedSize: number,
  expectedChecksum: string,
): Promise<void> {
  const remote = await getObject({ config, key });
  const reader = remote.body.getReader();
  const hash = createHash("sha256");
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    hash.update(value);
  }
  const actual = hash.digest("hex");
  if (size !== expectedSize || actual !== expectedChecksum) {
    throw new Error(`Installer full read-back mismatch (size ${size}, SHA-256 ${actual}).`);
  }
  console.log(`Full byte read-back verified for ${key}: ${size} bytes, SHA-256 ${actual}.`);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

void main();
