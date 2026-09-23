import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

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
  cleanup(): void;
}

interface CertificateGenerationResult {
  rootCertificatePath: string;
  certificatePfxPaths: Record<TlsFixtureCertificate, string>;
}

const FIXTURE_FRIENDLY_NAME = "MKTTool Relay TLS Fixture";

export function createTlsFixtureCertificates(): TlsFixtureCertificates {
  removeStaleFixtureCertificates();
  const directory = mkdtempSync(path.join(os.tmpdir(), "mkttool-relay-tls-certs-"));
  const passphrase = randomBytes(24).toString("base64url");
  let generated: CertificateGenerationResult;
  try {
    generated = JSON.parse(runPowerShell(generationScript(directory, passphrase))) as CertificateGenerationResult;
    assertCertificateResult(generated);
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw new Error("Windows could not create the disposable Relay TLS fixture certificates.");
  }

  return {
    rootCertificatePath: generated.rootCertificatePath,
    passphrase,
    certificatePfxPaths: generated.certificatePfxPaths,
    cleanup: () => {
      try {
        rmSync(directory, { recursive: true, force: true });
      } finally {
        removeStaleFixtureCertificates();
      }
    },
  };
}

/** A timed-out runner can skip a process finally block, so every run removes only its tagged leftovers first. */
function removeStaleFixtureCertificates(): void {
  runPowerShell(`
$ErrorActionPreference = 'Stop'
$friendlyName = ${powerShellLiteral(FIXTURE_FRIENDLY_NAME)}
$fixtures = @(Get-ChildItem -Path 'Cert:\\CurrentUser\\My' | Where-Object { $_.FriendlyName -eq $friendlyName })
foreach ($certificate in $fixtures) {
  $certificatePath = "Cert:\\CurrentUser\\My\\$($certificate.Thumbprint)"
  Remove-Item -LiteralPath $certificatePath -Force -ErrorAction Stop
  if (Test-Path -LiteralPath $certificatePath) { throw 'A stale Relay TLS fixture certificate could not be removed.' }
}
if (@(Get-ChildItem -Path 'Cert:\\CurrentUser\\My' | Where-Object { $_.FriendlyName -eq $friendlyName }).Count -ne 0) {
  throw 'A stale Relay TLS fixture certificate remains in the current-user store.'
}
`);
}

function generationScript(directory: string, passphrase: string): string {
  const quotedDirectory = powerShellLiteral(directory);
  const quotedPassphrase = powerShellLiteral(passphrase);
  return `
$ErrorActionPreference = 'Stop'
$directory = ${quotedDirectory}
$password = ConvertTo-SecureString ${quotedPassphrase} -AsPlainText -Force
$store = 'Cert:\\CurrentUser\\My'
$friendlyName = ${powerShellLiteral(FIXTURE_FRIENDLY_NAME)}
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
    $certificatePath = "Cert:\\CurrentUser\\My\\$($certificate.Thumbprint)"
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
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
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
