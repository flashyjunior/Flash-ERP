[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
  [string]$WorkspaceSlug,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^https://')]
  [string]$BaseUrl,

  [string]$ActorRef = 'VPS operator'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Resolve-NodeExecutable {
  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $runtimeNode = Get-ChildItem -LiteralPath 'C:\FlashRMS\runtime' -Filter node.exe -File -Recurse -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1
  if ($runtimeNode) {
    return $runtimeNode.FullName
  }

  throw 'Node.js was not found on PATH or under C:\FlashRMS\runtime.'
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$workerPath = Join-Path $PSScriptRoot 'trial-workspace-provisioner-worker.ts'
$environmentPath = Join-Path $repositoryRoot '.env'
if (-not (Test-Path -LiteralPath $workerPath -PathType Leaf)) {
  throw "Trial workspace provisioner worker was not found at $workerPath."
}
if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
  throw "The active release environment was not found at $environmentPath."
}

$normalizedBaseUrl = $BaseUrl.Trim().TrimEnd('/')
$parsedBaseUrl = [Uri]$normalizedBaseUrl
if (
  $parsedBaseUrl.Scheme -ne 'https' -or
  $parsedBaseUrl.AbsolutePath -ne '/' -or
  -not $parsedBaseUrl.IsDefaultPort -or
  $parsedBaseUrl.UserInfo -or
  $parsedBaseUrl.Query -or
  $parsedBaseUrl.Fragment
) {
  throw 'BaseUrl must be an HTTPS domain root without a path, query string, or fragment.'
}

$request = [ordered]@{
  version = 1
  workspaceSlug = $WorkspaceSlug.Trim().ToLowerInvariant()
  baseUrl = $normalizedBaseUrl
  actorRef = $ActorRef.Trim()
} | ConvertTo-Json -Compress

$node = Resolve-NodeExecutable
Push-Location $repositoryRoot
try {
  $request | & $node --import tsx $workerPath set-public-url
  if ($LASTEXITCODE -ne 0) {
    throw "Trial public URL update failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
