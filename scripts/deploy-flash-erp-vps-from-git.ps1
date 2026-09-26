[CmdletBinding()]
param(
  [string]$RepositoryRoot,
  [string]$Branch = "master",
  [string]$Remote = "origin",
  [string]$StoreCode = "accra-shop",
  [string]$HqPublicBaseUrl = "http://84.247.188.30:3000",
  [string]$MajeedPublicBaseUrl = "https://majeed.flashcodesolutions.com.gh",
  [string]$MajeedTaskName = "FlashERPTrial-s-majeed-phones-6398dfce",
  [ValidateRange(1024, 65535)]
  [int]$ProvisionerPort = 3099,
  [ValidateRange(1024, 65535)]
  [int]$MajeedPort = 3102,
  [switch]$AfterUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-NativeStep {
  param(
    [string]$Label,
    [scriptblock]$Command
  )

  Write-Step $Label
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE."
  }
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run Deploy-FlashERP-VPS.cmd from an elevated PowerShell window (Run as administrator)."
  }
}

function Get-DotEnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  $line = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match ("^\s*" + [regex]::Escape($Name) + "\s*=") } |
    Select-Object -First 1
  if (-not $line) {
    return $null
  }

  return (($line -replace ("^\s*" + [regex]::Escape($Name) + "\s*="), "").Trim()).Trim('"').Trim("'")
}

function Restore-EnvironmentValue {
  param(
    [string]$Name,
    [AllowNull()][string]$Value
  )

  if ($null -eq $Value) {
    Remove-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
  } else {
    Set-Item -LiteralPath "Env:$Name" -Value $Value
  }
}

function Assert-ReadyEndpoint {
  param(
    [string]$Uri,
    [string]$Label
  )

  $response = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 60
  if (-not $response -or $response.ready -ne $true) {
    throw "$Label did not report ready=true."
  }
}

function Assert-ListeningPort {
  param(
    [int]$Port,
    [string]$Label
  )

  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $listener) {
    throw "$Label is not listening on port $Port."
  }
}

if (-not $RepositoryRoot) {
  $RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $RepositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
}

Assert-Administrator
Set-Location $RepositoryRoot

if (-not (Test-Path -LiteralPath (Join-Path $RepositoryRoot ".git") -PathType Container)) {
  throw "$RepositoryRoot is not a Git checkout."
}

$trackedChanges = @(git status --porcelain --untracked-files=no)
if ($LASTEXITCODE -ne 0) {
  throw "Git status failed."
}
if ($trackedChanges.Count -gt 0) {
  git status -sb
  throw "Tracked local changes exist. Review them before deploying; the one-command deployer will not overwrite them."
}

if (-not $AfterUpdate) {
  Invoke-NativeStep "Switching to $Branch" { git switch $Branch }
  Invoke-NativeStep "Fetching $Remote" { git fetch $Remote --prune }
  Invoke-NativeStep "Fast-forwarding $Branch" { git pull --ff-only $Remote $Branch }

  Write-Step "Relaunching the current deployment script after the Git update"
  $scriptPath = Join-Path $RepositoryRoot "scripts\deploy-flash-erp-vps-from-git.ps1"
  & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $scriptPath `
    -RepositoryRoot $RepositoryRoot `
    -Branch $Branch `
    -Remote $Remote `
    -StoreCode $StoreCode `
    -HqPublicBaseUrl $HqPublicBaseUrl `
    -MajeedPublicBaseUrl $MajeedPublicBaseUrl `
    -MajeedTaskName $MajeedTaskName `
    -ProvisionerPort $ProvisionerPort `
    -MajeedPort $MajeedPort `
    -AfterUpdate
  exit $LASTEXITCODE
}

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $Branch) {
  throw "Expected branch $Branch after update, but the checkout is on $currentBranch."
}
$syncCounts = ((git rev-list --left-right --count "HEAD...$Remote/$Branch") -split "\s+")
if ($LASTEXITCODE -ne 0 -or $syncCounts.Count -lt 2 -or $syncCounts[0] -ne "0" -or $syncCounts[1] -ne "0") {
  throw "$Branch is not exactly synchronized with $Remote/$Branch."
}

$hqTask = Get-ScheduledTask -TaskName "FlashRMSHQ" -ErrorAction SilentlyContinue
if (-not $hqTask) {
  throw "Scheduled task FlashRMSHQ does not exist."
}
$taskRoot = @($hqTask.Actions |
  ForEach-Object { $_.WorkingDirectory } |
  Where-Object { $_ }) |
  Select-Object -First 1
$environmentCandidates = @("C:\FlashRMS\shared\.env")
if ($taskRoot) {
  $environmentCandidates += (Join-Path $taskRoot ".env")
}
$environmentCandidates += "C:\FlashRMS\.env"
$environmentFile = $environmentCandidates |
  Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $environmentFile) {
  throw "The active HQ environment file was not found."
}
$databaseUrl = Get-DotEnvValue -Path $environmentFile -Name "DATABASE_URL"
if (-not $databaseUrl) {
  throw "DATABASE_URL is missing from the active HQ environment file."
}

$previousDatabaseUrl = $env:DATABASE_URL
$previousBuildMemory = $env:FLASH_ERP_NEXT_BUILD_MEMORY_MB
$previousBuildCpus = $env:FLASH_ERP_NEXT_BUILD_CPUS
$releaseId = $null

try {
  $env:DATABASE_URL = $databaseUrl
  $env:FLASH_ERP_NEXT_BUILD_MEMORY_MB = "6144"
  $env:FLASH_ERP_NEXT_BUILD_CPUS = "1"

  $lockPath = Join-Path $RepositoryRoot "package-lock.json"
  $dependencyStamp = Join-Path $RepositoryRoot "node_modules\.flash-erp-package-lock.sha256"
  $lockHash = (Get-FileHash -LiteralPath $lockPath -Algorithm SHA256).Hash
  $installedHash = if (Test-Path -LiteralPath $dependencyStamp -PathType Leaf) {
    (Get-Content -LiteralPath $dependencyStamp -Raw).Trim()
  } else {
    ""
  }
  if ($installedHash -ne $lockHash -or -not (Test-Path -LiteralPath (Join-Path $RepositoryRoot "node_modules\.bin\tsx.cmd") -PathType Leaf)) {
    Invoke-NativeStep "Installing the dependency lockfile" { npm.cmd ci }
    $lockHash | Set-Content -LiteralPath $dependencyStamp -Encoding ASCII
  } else {
    Write-Host "`nDependencies already match package-lock.json." -ForegroundColor Green
  }

  $validationScripts = @(
    "acceptance:vps-deploy",
    "acceptance:trial-lifecycle",
    "acceptance:license-renewal",
    "acceptance:enterprise-authorization",
    "acceptance:sales-order-collections",
    "acceptance:online-store-parity",
    "acceptance:transfer-requests",
    "acceptance:transfer-publication"
  )
  foreach ($validationScript in $validationScripts) {
    Invoke-NativeStep "Running $validationScript" { npm.cmd run $validationScript }
  }
  Invoke-NativeStep "Building the production deployment" { npm.cmd run build:deploy }

  $postBuildChanges = @(git status --porcelain --untracked-files=no)
  if ($postBuildChanges.Count -gt 0) {
    git status -sb
    throw "The build changed tracked source files. Review them before packaging."
  }

  $commit = (git rev-parse --short=7 HEAD).Trim()
  $releaseId = "$commit-r$(Get-Date -Format 'yyyyMMddHHmmss')"
  Invoke-NativeStep "Packaging release $releaseId" {
    powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File (Join-Path $RepositoryRoot "scripts\package-flash-erp-vps-release.ps1") `
      -ReleaseId $releaseId `
      -StoreCode $StoreCode `
      -PublicBaseUrl $HqPublicBaseUrl
  }
} finally {
  Restore-EnvironmentValue -Name "DATABASE_URL" -Value $previousDatabaseUrl
  Restore-EnvironmentValue -Name "FLASH_ERP_NEXT_BUILD_MEMORY_MB" -Value $previousBuildMemory
  Restore-EnvironmentValue -Name "FLASH_ERP_NEXT_BUILD_CPUS" -Value $previousBuildCpus
}

if (-not $releaseId) {
  throw "A release ID was not created."
}
$packageName = "FlashERP-HQ-$($releaseId.ToUpperInvariant())-VPS-Deploy-Resolved"
$zipPath = Join-Path $RepositoryRoot "artifacts\releases\$packageName.zip"
$hashPath = "$zipPath.sha256.txt"
$operatorRoot = Join-Path "C:\Users\Demo\Desktop" $packageName
if (-not (Test-Path -LiteralPath $zipPath -PathType Leaf) -or -not (Test-Path -LiteralPath $hashPath -PathType Leaf)) {
  throw "The package ZIP or its SHA-256 file is missing."
}
$expectedHash = ((Get-Content -LiteralPath $hashPath -Raw).Trim() -split "\s+")[0]
$actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
if ($expectedHash -ne $actualHash) {
  throw "Release ZIP checksum mismatch."
}
if (Test-Path -LiteralPath $operatorRoot) {
  throw "Operator folder already exists: $operatorRoot. Run again to create a fresh release ID."
}

Write-Step "Extracting the verified operator package"
Expand-Archive -LiteralPath $zipPath -DestinationPath $operatorRoot
$manifestPath = Join-Path $operatorRoot "release-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$deploymentScript = Join-Path $operatorRoot ([string]$manifest.deploymentScript)
Invoke-NativeStep "Deploying release $releaseId" {
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File $deploymentScript
}

Write-Step "Verifying HQ, the trial provisioner, and Majeed"
$hqTask = Get-ScheduledTask -TaskName "FlashRMSHQ"
if ([string]$hqTask.State -ne "Running") {
  throw "FlashRMSHQ is not Running after deployment."
}
$majeedTask = Get-ScheduledTask -TaskName $MajeedTaskName -ErrorAction SilentlyContinue
if (-not $majeedTask -or [string]$majeedTask.State -ne "Running") {
  throw "$MajeedTaskName is not Running after reconciliation."
}
Assert-ListeningPort -Port 3000 -Label "HQ"
Assert-ListeningPort -Port $ProvisionerPort -Label "Trial provisioner"
Assert-ListeningPort -Port $MajeedPort -Label "Majeed"

$provisionerHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$ProvisionerPort/health" -Method Get -TimeoutSec 60
if (-not $provisionerHealth -or $provisionerHealth.ok -ne $true -or [string]$provisionerHealth.reconciliation.status -ne "succeeded") {
  throw "Trial provisioner reconciliation did not report succeeded."
}
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/system/live" -Method Get -TimeoutSec 60 | Out-Null
Assert-ReadyEndpoint -Uri "http://127.0.0.1:3000/api/system/database-readiness" -Label "HQ"
Invoke-RestMethod -Uri "$MajeedPublicBaseUrl/api/system/live" -Method Get -TimeoutSec 60 | Out-Null
Assert-ReadyEndpoint -Uri "$MajeedPublicBaseUrl/api/system/database-readiness" -Label "Majeed"

$edgeService = Get-Service -Name "FlashERPEdge" -ErrorAction SilentlyContinue
if (-not $edgeService -or [string]$edgeService.Status -ne "Running") {
  throw "FlashERPEdge is not Running."
}

Write-Host "`nFlash ERP deployment completed successfully." -ForegroundColor Green
Write-Host "Release: $releaseId"
Write-Host "HQ: $HqPublicBaseUrl"
Write-Host "Majeed: $MajeedPublicBaseUrl"
Write-Host "Package: $zipPath"
