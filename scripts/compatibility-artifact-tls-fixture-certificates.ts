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

export function createTlsFixtureCertificates(): TlsFixtureCertificates {
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
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}

function generationScript(directory: string, passphrase: string): string {
  const quotedDirectory = powerShellLiteral(directory);
  const quotedPassphrase = powerShellLiteral(passphrase);
  return `
$ErrorActionPreference = 'Stop'
$directory = ${quotedDirectory}
$password = ConvertTo-SecureString ${quotedPassphrase} -AsPlainText -Force
$store = 'Cert:\\CurrentUser\\My'
$serverUsage = '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
$created = @()
try {
$root = New-SelfSignedCertificate -Type Custom -Subject 'CN=MKTTool Relay TLS Fixture Root' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={text}CA=true&pathlength=1') -CertStoreLocation $store -NotAfter (Get-Date).AddDays(2)
$created += $root
$intermediate = New-SelfSignedCertificate -Type Custom -Subject 'CN=MKTTool Relay TLS Fixture Intermediate' -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage CertSign,CRLSign,DigitalSignature -TextExtension @('2.5.29.19={text}CA=true&pathlength=0') -CertStoreLocation $store -NotAfter (Get-Date).AddDays(2)
$created += $intermediate
$trusted = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $trusted
$selfSigned = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $selfSigned
$missingIntermediate = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -Signer $intermediate -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
$created += $missingIntermediate
$expired = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName 'localhost' -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotBefore (Get-Date).AddDays(-3) -NotAfter (Get-Date).AddDays(-1)
$created += $expired
$wrongHostname = New-SelfSignedCertificate -Type Custom -Subject 'CN=wrong-fixture.invalid' -DnsName 'wrong-fixture.invalid' -Signer $root -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @($serverUsage) -CertStoreLocation $store -NotAfter (Get-Date).AddDays(1)
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
