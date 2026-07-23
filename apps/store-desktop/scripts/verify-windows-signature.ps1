$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $packageRoot "package.json") -Raw | ConvertFrom-Json
$releaseRoot = Join-Path $packageRoot "release"
$unpackedRoot = Join-Path $releaseRoot "win-unpacked"

if (-not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
  throw "The Windows release folder was not found at $releaseRoot. Build the installer before verifying its signature."
}

if (-not (Test-Path -LiteralPath $unpackedRoot -PathType Container)) {
  throw "The packaged Windows application folder was not found at $unpackedRoot. Build the installer before verifying its signature."
}

$installer = Get-ChildItem -LiteralPath $releaseRoot -Filter "*-$($packageJson.version)-x64.exe" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$application = Get-ChildItem -LiteralPath $unpackedRoot -Filter "*.exe" -File |
  Sort-Object Length -Descending |
  Select-Object -First 1

if (-not $installer) {
  throw "The Windows installer for version $($packageJson.version) was not found in $releaseRoot."
}

if (-not $application) {
  throw "The packaged Windows application executable was not found in $unpackedRoot."
}

foreach ($target in @($installer, $application)) {
  $signature = Get-AuthenticodeSignature -LiteralPath $target.FullName

  if ($signature.Status -ne "Valid" -or -not $signature.SignerCertificate) {
    throw "$($target.Name) does not have a valid Authenticode signature. Status: $($signature.Status)."
  }

  if (-not $signature.TimeStamperCertificate) {
    throw "$($target.Name) is signed but has no trusted timestamp."
  }

  Write-Host "$($target.Name) is signed by $($signature.SignerCertificate.Subject)."
}
