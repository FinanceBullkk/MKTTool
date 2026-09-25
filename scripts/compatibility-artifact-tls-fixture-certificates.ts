import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { acquireWindowsNamedMutex } from "./windows-named-mutex";

export type TlsFixtureCertificate =
  | "trusted"
  | "selfSigned"
  | "missingIntermediate"
  | "expired"
  | "wrongHostname";

export interface TlsFixtureCertificates {
  rootCertificatePath: string;
  passphrase: string;
  certificatePfxPaths: Record<TlsFixtureCertificate, string>;
  cleanup(): Promise<void>;
}

interface CertificateGenerationResult {
  rootCertificatePath: string;
  certificatePfxPaths: Record<TlsFixtureCertificate, string>;
}

const FIXTURE_FRIENDLY_NAME_PREFIX = "MKTTool Relay TLS Fixture/";
const FIXTURE_MUTEX_NAME = "MKTToolRelayTlsFixtureCertificateStore-v1";
const FIXTURE_DIRECTORY_PREFIX = "mkttool-relay-tls-certs-";
const FIXTURE_DIRECTORY_STALE_MS = 5 * 60 * 1_000;
const FIXTURE_DIRECTORY_FILES = new Set([
  "expired.pfx",
  "missing-intermediate.pfx",
  "root.cer",
  "root.pem",
  "self-signed.pfx",
  "trusted.pfx",
  "wrong-hostname.pfx",
]);

export async function createTlsFixtureCertificates(): Promise<TlsFixtureCertificates> {
  const lock = await acquireWindowsNamedMutex(FIXTURE_MUTEX_NAME);
  let directory: string | undefined;
  let keepLock = false;
  try {
    directory = mkdtempSync(path.join(os.tmpdir(), "mkttool-relay-tls-certs-"));
    const fixtureDirectory = directory;
    const friendlyName = `${FIXTURE_FRIENDLY_NAME_PREFIX}${randomUUID()}`;
    const passphrase = randomBytes(24).toString("base64url");
    removeStaleFixtureDirectories();
    // The current-user Global kernel mutex makes prefix cleanup safe across Windows sessions.
    removeFixtureCertificates(FIXTURE_FRIENDLY_NAME_PREFIX, true);
    const generated = JSON.parse(runPowerShell(generationScript(fixtureDirectory, passphrase, friendlyName))) as CertificateGenerationResult;
    assertCertificateResult(generated);

    let cleaned = false;
    keepLock = true;
    return {
      rootCertificatePath: generated.rootCertificatePath,
      passphrase,
      certificatePfxPaths: generated.certificatePfxPaths,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        let failed = false;
        try {
          // Keep each cleanup leg independent: a failed store cleanup must not retain the PFXs.
          removeFixtureCertificates(friendlyName, false);
        } catch {
          failed = true;
        }
        try {
          rmSync(fixtureDirectory, { recursive: true, force: true });
        } catch {
          failed = true;
        }
        try {
          await lock.release();
        } catch {
          failed = true;
        }
        if (failed) throw new Error("The disposable Relay TLS fixture cleanup did not finish.");
      },
    };
  } catch {
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // The mutex still releases in the finally block if local cleanup cannot run.
      }
    }
    throw new Error("Windows could not create the disposable Relay TLS fixture certificates.");
  } finally {
    if (!keepLock) await lock.release();
  }
}

function removeStaleFixtureDirectories(): void {
  const now = Date.now();
  for (const entry of readdirSync(os.tmpdir(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(FIXTURE_DIRECTORY_PREFIX)) continue;
    const directory = path.join(os.tmpdir(), entry.name);
    if (now - statSync(directory).mtimeMs <= FIXTURE_DIRECTORY_STALE_MS) continue;
    const contents = readdirSync(directory, { withFileTypes: true });
    if (contents.some((item) => !item.isFile() || !FIXTURE_DIRECTORY_FILES.has(item.name))) continue;
    rmSync(directory, { recursive: true, force: true });
  }
}

/** A timed-out runner can skip its finally block; this only runs while the fixture lock is held. */
function removeFixtureCertificates(friendlyName: string, isPrefix: boolean): void {
  runPowerShell(`
$ErrorActionPreference = 'Stop'
$friendlyName = ${powerShellLiteral(friendlyName)}
$match = if (${isPrefix ? "$true" : "$false"}) { "$friendlyName*" } else { $friendlyName }
foreach ($store in @('Cert:\\CurrentUser\\My', 'Cert:\\CurrentUser\\Root')) {
  $fixtures = @(Get-ChildItem -Path $store | Where-Object {
    if (${isPrefix ? "$true" : "$false"}) { $_.FriendlyName -like $match } else { $_.FriendlyName -eq $match }
  })
  foreach ($certificate in $fixtures) {
    $certificatePath = "$store\\$($certificate.Thumbprint)"
    Remove-Item -LiteralPath $certificatePath -Force -ErrorAction Stop
    if (Test-Path -LiteralPath $certificatePath) { throw 'A stale Relay TLS fixture certificate could not be removed.' }
  }
  $remaining = @(Get-ChildItem -Path $store | Where-Object {
    if (${isPrefix ? "$true" : "$false"}) { $_.FriendlyName -like $match } else { $_.FriendlyName -eq $match }
  })
  if ($remaining.Count -ne 0) {
    throw 'A stale Relay TLS fixture certificate remains in the current-user store.'
  }
}
`);
}

function generationScript(directory: string, passphrase: string, friendlyName: string): string {
  const quotedDirectory = powerShellLiteral(directory);
  const quotedPassphrase = powerShellLiteral(passphrase);
  return `
$ErrorActionPreference = 'Stop'
$directory = ${quotedDirectory}
$password = ConvertTo-SecureString ${quotedPassphrase} -AsPlainText -Force
$store = 'Cert:\\CurrentUser\\My'
$friendlyName = ${powerShellLiteral(friendlyName)}
$serverUsage = '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
$created = @()
try {
$root = New-SelfSignedCertificate -Type Custom -Subject 'CN=MKTTool Relay TLS Fixture Root' -FriendlyName $friendlyName -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={text}CA=true&pathlength=1') -CertStoreLocation $store -NotAfter (Get-Date).AddDays(2)
$created += $root
$intermediate = New-SelfSignedCertificate -Type Custom -Subject 'CN=MKTTool Relay TLS Fixture Intermediate' -FriendlyName $friendlyName -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={text}CA=true&pathlength=0') -CertStoreLocation $store -NotAfter (Get-Date).AddDays(2)
$created += $intermediate
$trusted = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -FriendlyName $friendlyName -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $trusted
$selfSigned = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -FriendlyName $friendlyName -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $selfSigned
$missingIntermediate = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -FriendlyName $friendlyName -Signer $intermediate -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $missingIntermediate
$expired = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -FriendlyName $friendlyName -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotBefore (Get-Date).AddDays(-3) -NotAfter (Get-Date).AddDays(-1)
$created += $expired
$wrongHostname = New-SelfSignedCertificate -Type Custom -Subject 'CN=wrong-fixture.invalid' -DnsName 'wrong-fixture.invalid' -FriendlyName $friendlyName -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $wrongHostname
function Export-FixturePfx($certificate, $name) {
  Export-PfxCertificate -Cert $certificate -FilePath (Join-Path $directory ("$name.pfx")) -Password $password -ChainOption EndEntityCertOnly | Out-Null
}
Export-FixturePfx $trusted 'trusted'
Export-FixturePfx $selfSigned 'self-signed'
Export-FixturePfx $missingIntermediate 'missing-intermediate'
Export-FixturePfx $expired 'expired'
Export-FixturePfx $wrongHostname 'wrong-hostname'
Export-Certificate -Cert $root -FilePath (Join-Path $directory 'root.cer') -Type CERT | Out-Null
& "$env:SystemRoot\\System32\\certutil.exe" -f -encode (Join-Path $directory 'root.cer') (Join-Path $directory 'root.pem') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'certutil could not encode the fixture CA.' }
[pscustomobject]@{
  rootCertificatePath = (Join-Path $directory 'root.pem')
  certificatePfxPaths = [pscustomobject]@{
    trusted = (Join-Path $directory 'trusted.pfx')
    selfSigned = (Join-Path $directory 'self-signed.pfx')
    missingIntermediate = (Join-Path $directory 'missing-intermediate.pfx')
    expired = (Join-Path $directory 'expired.pfx')
    wrongHostname = (Join-Path $directory 'wrong-hostname.pfx')
  }
} | ConvertTo-Json -Compress
} finally {
  foreach ($certificate in $created) {
    $certificatePath = "$store\\$($certificate.Thumbprint)"
    Remove-Item -LiteralPath $certificatePath -Force -ErrorAction SilentlyContinue
    if (Test-Path -LiteralPath $certificatePath) { throw 'The disposable TLS fixture certificate could not be removed.' }
  }
}
`;
}

function runPowerShell(script: string): string {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      windowsHide: true,
    },
  ).trim();
}

function powerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertCertificateResult(result: CertificateGenerationResult): void {
  const names: TlsFixtureCertificate[] = [
    "trusted",
    "selfSigned",
    "missingIntermediate",
    "expired",
    "wrongHostname",
  ];
  if (
    typeof result.rootCertificatePath !== "string" ||
    names.some((name) => typeof result.certificatePfxPaths?.[name] !== "string")
  ) {
    throw new Error("The generated TLS fixture certificate set is incomplete.");
  }
}
