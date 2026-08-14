param(
  [Parameter(Mandatory = $true)]
  [string]$Output
)

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceNames = @(
  "offline-root-ceremony.mjs",
  "offline-ceremony-io.mjs",
  "offline-root-backup-files.mjs",
  "release-authority-format.mjs",
  "release-authority-key-primitives.mjs"
)
$sourcePaths = $sourceNames | ForEach-Object { Join-Path $scriptDirectory $_ }

foreach ($sourcePath in $sourcePaths) {
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Offline ceremony source file is missing: $sourcePath"
  }
}

$destination = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $destination) {
  throw "Refusing to overwrite the existing offline ceremony bundle: $destination"
}

$destinationDirectory = Split-Path -Parent $destination
if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $destinationDirectory | Out-Null
}

Compress-Archive -LiteralPath $sourcePaths -DestinationPath $destination -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant()

Write-Output "Offline ceremony bundle: $destination"
Write-Output "Bundle SHA-256: $hash"
Write-Output "Paper comparison fingerprint: $($hash.Substring(0, 32))"
