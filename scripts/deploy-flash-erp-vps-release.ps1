[CmdletBinding()]
param(
  [switch]$PreflightOnly,
  [string]$TaskName = "FlashRMSHQ",
  [string]$ValidateLayoutRoot,
  [switch]$HydratedLayout,
  [string]$ExpectedNodeModulesTarget,
  [string]$ExpectedUploadsTarget,
  [string]$ExpectedEnvironmentSource
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this deployment command from an elevated PowerShell window (Run as administrator)."
  }
}

function Get-RuntimeNode {
  param([string]$InstallRoot)

  $runtimeRoot = Join-Path $InstallRoot "runtime"
  if (Test-Path -LiteralPath $runtimeRoot) {
    $runtimeNode = Get-ChildItem -LiteralPath $runtimeRoot -Filter "node.exe" -File -Recurse -ErrorAction SilentlyContinue |
      Sort-Object FullName |
      Select-Object -First 1
    if ($runtimeNode) {
      return $runtimeNode.FullName
    }
  }

  $pathNode = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($pathNode) {
    Write-Warning "The managed Flash RMS runtime Node was not found. Falling back to $($pathNode.Source)."
    return $pathNode.Source
  }

  throw "Node.js was not found below $runtimeRoot or on PATH."
}

function Get-ActiveReleaseRoot {
  param(
    [object[]]$Actions,
    [string]$InstallRoot
  )

  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($action in $Actions) {
    if ($action.WorkingDirectory) {
      $candidates.Add([string]$action.WorkingDirectory)
    }

    $actionText = "{0} {1} {2}" -f $action.Execute, $action.Arguments, $action.WorkingDirectory
    $matches = [regex]::Matches(
      $actionText,
      "(?i)C:\\FlashRMS\\releases\\FlashRMS-[A-Za-z0-9._-]+"
    )
    foreach ($match in $matches) {
      $candidates.Add($match.Value)
    }
  }

  $currentPointer = Join-Path $InstallRoot "current"
  if (Test-Path -LiteralPath $currentPointer) {
    $candidates.Add($currentPointer)
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    $nodeModules = Join-Path $candidate "node_modules"
    if (Test-Path -LiteralPath $nodeModules) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  throw "The active Flash ERP release could not be resolved from the $TaskName scheduled task, and no reusable node_modules directory was found."
}

function Get-JunctionTarget {
  param([string]$Path)

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -and $item.PSObject.Properties.Name -contains "Target") {
    $target = @($item.Target) | Select-Object -First 1
    if ($target -and (Test-Path -LiteralPath $target)) {
      return (Resolve-Path -LiteralPath $target).Path
    }
  }

  return (Resolve-Path -LiteralPath $Path).Path
}

function New-DirectoryJunction {
  param(
    [string]$Path,
    [string]$Target
  )

  if (Test-Path -LiteralPath $Path) {
    throw "Cannot create a junction because the path already exists: $Path"
  }
  $parent = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  New-Item -ItemType Junction -Path $Path -Target $Target | Out-Null
}

function Invoke-Robocopy {
  param(
    [string]$Source,
    [string]$Destination
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  & robocopy.exe $Source $Destination /E /XJ /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE while copying $Source to $Destination."
  }
}

function Assert-DirectoryJunctionTarget {
  param(
    [string]$Path,
    [string]$ExpectedTarget,
    [string]$Label
  )

  if (-not $ExpectedTarget) {
    throw "$Label expected target was not supplied."
  }
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "$Label junction is missing: $Path"
  }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
    throw "$Label must be a directory junction: $Path"
  }

  $actualTarget = Get-JunctionTarget -Path $Path
  $resolvedExpected = (Resolve-Path -LiteralPath $ExpectedTarget).Path
  if (-not [string]::Equals($actualTarget, $resolvedExpected, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label junction target mismatch. Expected $resolvedExpected, received $actualTarget."
  }
}

function Assert-RuntimeModuleResolution {
  param(
    [string]$Root,
    [string]$NodeExecutable,
    [object]$Manifest
  )

  $runtimeModules = @($Manifest.requiredRuntimeModules)
  if ($runtimeModules.Count -eq 0) {
    throw "The release manifest has no required runtime modules."
  }

  $previousRuntimeBase = $env:FLASH_ERP_RUNTIME_RESOLUTION_BASE
  $previousRuntimeModules = $env:FLASH_ERP_RUNTIME_MODULES
  $runtimeSmokeScript = Join-Path ([IO.Path]::GetTempPath()) ("flash-erp-runtime-module-smoke-{0}.cjs" -f [Guid]::NewGuid().ToString("N"))
  try {
    $env:FLASH_ERP_RUNTIME_RESOLUTION_BASE = Join-Path $Root "apps\enterprise-web\.next\server"
    $env:FLASH_ERP_RUNTIME_MODULES = ConvertTo-Json -InputObject $runtimeModules -Compress -Depth 4
    @'
const path = require("node:path");
const { createRequire } = require("node:module");
const runtimeRequire = createRequire(
  path.join(process.env.FLASH_ERP_RUNTIME_RESOLUTION_BASE, "flash-erp-runtime-smoke.cjs"),
);
const checks = JSON.parse(process.env.FLASH_ERP_RUNTIME_MODULES);
for (const check of checks) {
  const loaded = runtimeRequire(check.specifier);
  if (check.requiredExport && typeof loaded[check.requiredExport] === "undefined") {
    throw new Error(`${check.specifier} does not export ${check.requiredExport}`);
  }
}
process.stdout.write("FLASH_ERP_RUNTIME_MODULE_RESOLUTION=OK\n");
'@ | Set-Content -LiteralPath $runtimeSmokeScript -Encoding ASCII
    & $NodeExecutable $runtimeSmokeScript
    if ($LASTEXITCODE -ne 0) {
      throw "Runtime module resolution failed with exit code $LASTEXITCODE."
    }
  } finally {
    $env:FLASH_ERP_RUNTIME_RESOLUTION_BASE = $previousRuntimeBase
    $env:FLASH_ERP_RUNTIME_MODULES = $previousRuntimeModules
    if (Test-Path -LiteralPath $runtimeSmokeScript -PathType Leaf) {
      Remove-Item -LiteralPath $runtimeSmokeScript -Force
    }
  }
}

function Assert-PayloadLayout {
  param(
    [string]$Root,
    [object]$Manifest,
    [switch]$Hydrated,
    [string]$ExpectedNodeModules,
    [string]$ExpectedUploads,
    [string]$ExpectedEnvironment
  )

  $required = @(
    "apps\enterprise-web\.next\BUILD_ID",
    "apps\enterprise-web\.next\server",
    "apps\enterprise-web\.next\static",
    "apps\enterprise-web\public",
    "apps\enterprise-web\next.config.mjs",
    "apps\enterprise-web\package.json",
    "scripts\run-enterprise-web-service.mjs",
    "scripts\start-enterprise-web.mjs",
    "prisma\schema.prisma",
    "prisma\migrations-sqlserver",
    "prisma.config.ts",
    "package.json",
    "release-runtime-manifest.json"
  )
  foreach ($relativePath in $required) {
    $requiredPath = Join-Path $Root $relativePath
    if (-not (Test-Path -LiteralPath $requiredPath)) {
      throw "The runtime payload is missing required path: $relativePath"
    }
  }

  $forbidden = @(
    "apps\enterprise-web\.next\standalone",
    "apps\enterprise-web\.next\dev",
    "apps\enterprise-web\.next\cache"
  )
  if (-not $Hydrated) {
    $forbidden += @(
      "apps\enterprise-web\public\uploads",
      "node_modules"
    )
  }
  foreach ($relativePath in $forbidden) {
    if (Test-Path -LiteralPath (Join-Path $Root $relativePath)) {
      throw "The runtime payload contains forbidden path: $relativePath"
    }
  }

  if ($Hydrated) {
    $hydratedEnvironment = Join-Path $Root ".env"
    if (-not (Test-Path -LiteralPath $hydratedEnvironment -PathType Leaf)) {
      throw "The hydrated release is missing its restored root .env file."
    }
    if (-not $ExpectedEnvironment -or -not (Test-Path -LiteralPath $ExpectedEnvironment -PathType Leaf)) {
      throw "The hydrated release environment source is missing or was not supplied."
    }
    $expectedEnvironmentHash = (Get-FileHash -LiteralPath $ExpectedEnvironment -Algorithm SHA256).Hash
    $hydratedEnvironmentHash = (Get-FileHash -LiteralPath $hydratedEnvironment -Algorithm SHA256).Hash
    if ($hydratedEnvironmentHash -ne $expectedEnvironmentHash) {
      throw "The hydrated release root .env does not match the approved environment source."
    }

    Assert-DirectoryJunctionTarget `
      -Path (Join-Path $Root "node_modules") `
      -ExpectedTarget $ExpectedNodeModules `
      -Label "Root node_modules"
    Assert-DirectoryJunctionTarget `
      -Path (Join-Path $Root "apps\enterprise-web\public\uploads") `
      -ExpectedTarget $ExpectedUploads `
      -Label "Shared ecommerce uploads"
  } else {
    $environmentFiles = Get-ChildItem -LiteralPath $Root -File -Force -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -eq ".env" -or $_.Name -like ".env.*" }
    if ($environmentFiles) {
      throw "The pristine runtime payload contains an environment file: $($environmentFiles[0].FullName)"
    }
  }

  foreach ($migrationName in @($Manifest.requiredMigrations)) {
    $migrationPath = Join-Path (Join-Path $Root "prisma\migrations-sqlserver") ([string]$migrationName)
    if (-not (Test-Path -LiteralPath $migrationPath)) {
      throw "The runtime payload is missing migration $migrationName."
    }
  }

  $dependencyModel = [string]$Manifest.runtimeDependencyModel
  $supportedDependencyModels = @(
    "reused-root-node-modules",
    "packaged-next-aliases-plus-reused-root-node-modules"
  )
  if ($supportedDependencyModels -notcontains $dependencyModel) {
    throw "The release manifest has an unsupported runtime dependency model: $dependencyModel"
  }
  if (@($Manifest.requiredRuntimeModules).Count -eq 0) {
    throw "The release manifest has no required runtime modules."
  }

  $runtimeAliases = @($Manifest.requiredRuntimeAliases)
  if ($runtimeAliases.Count -gt 0) {
    if ($dependencyModel -ne "packaged-next-aliases-plus-reused-root-node-modules") {
      throw "The runtime payload contains aliases under an incompatible dependency model."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Root "apps\enterprise-web\.next\node_modules") -PathType Container)) {
      throw "The runtime payload is missing its packaged Next dependency aliases."
    }
  } elseif ($dependencyModel -ne "reused-root-node-modules") {
    throw "The release dependency model requires aliases, but the manifest has none."
  }

  foreach ($alias in $runtimeAliases) {
    $relativeAliasPath = ([string]$alias.path).Replace("/", "\")
    $aliasPath = Join-Path $Root $relativeAliasPath
    if (-not (Test-Path -LiteralPath $aliasPath -PathType Container)) {
      throw "The runtime payload is missing the packaged Next runtime dependency alias: $aliasPath"
    }
    $aliasItem = Get-Item -LiteralPath $aliasPath -Force
    if (($aliasItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "The packaged Next runtime dependency alias is still a link instead of physical files: $aliasPath"
    }
    foreach ($requiredFile in @($alias.requiredFiles)) {
      if (-not (Test-Path -LiteralPath (Join-Path $aliasPath ([string]$requiredFile)) -PathType Leaf)) {
        throw "The packaged Next runtime dependency alias is incomplete: $relativeAliasPath\$requiredFile"
      }
    }
  }

  $buildId = (Get-Content -LiteralPath (Join-Path $Root "apps\enterprise-web\.next\BUILD_ID") -Raw).Trim()
  if ($buildId -ne [string]$Manifest.buildId) {
    throw "The runtime BUILD_ID '$buildId' does not match the package manifest '$($Manifest.buildId)'."
  }
}

function Join-BaseUri {
  param(
    [string]$BaseUri,
    [string]$Path
  )
  return "{0}/{1}" -f $BaseUri.TrimEnd("/"), $Path.TrimStart("/")
}

function Invoke-CheckedGet {
  param(
    [string]$Uri,
    [string]$Label
  )

  $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 30
  if ([int]$response.StatusCode -ne 200) {
    throw "$Label returned HTTP $($response.StatusCode): $Uri"
  }
  return $response
}

function Assert-HealthSuite {
  param(
    [string]$BaseUri,
    [string]$StoreCode,
    [string]$Label
  )

  $encodedStoreCode = [Uri]::EscapeDataString($StoreCode)
  [void](Invoke-CheckedGet -Uri (Join-BaseUri $BaseUri "api/system/live") -Label "$Label live health")
  $readinessResponse = Invoke-CheckedGet -Uri (Join-BaseUri $BaseUri "api/system/database-readiness") -Label "$Label database readiness"
  $readiness = $readinessResponse.Content | ConvertFrom-Json
  if ($readiness.ready -ne $true) {
    throw "$Label database readiness returned HTTP 200 but ready was not true: $($readinessResponse.Content)"
  }

  $catalogResponse = Invoke-CheckedGet -Uri (Join-BaseUri $BaseUri "api/ecommerce/$encodedStoreCode/catalog") -Label "$Label ecommerce catalog"
  $catalog = $catalogResponse.Content | ConvertFrom-Json
  [void](Invoke-CheckedGet -Uri (Join-BaseUri $BaseUri "shop/$encodedStoreCode") -Label "$Label storefront")

  foreach ($heroImageUrl in @($catalog.store.heroImageUrls)) {
    if (-not $heroImageUrl) {
      continue
    }
    $imageUri = [string]$heroImageUrl
    if (-not [Uri]::IsWellFormedUriString($imageUri, [UriKind]::Absolute)) {
      $imageUri = Join-BaseUri $BaseUri $imageUri
    }
    [void](Invoke-CheckedGet -Uri $imageUri -Label "$Label storefront hero image")
  }

  Write-Host "$Label live, readiness, catalog, storefront, and configured hero-image checks passed." -ForegroundColor Green
}

function Wait-ForLocalLive {
  param(
    [string]$BaseUri,
    [int]$TimeoutSeconds = 180
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      [void](Invoke-CheckedGet -Uri (Join-BaseUri $BaseUri "api/system/live") -Label "Local live health")
      return
    } catch {
      Start-Sleep -Seconds 3
    }
  } while ((Get-Date) -lt $deadline)

  throw "Flash ERP did not return HTTP 200 from the local live endpoint within $TimeoutSeconds seconds."
}

function Stop-ManagedListener {
  param(
    [int]$Port,
    [string]$InstallRoot
  )

  $deadline = (Get-Date).AddSeconds(45)
  do {
    $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($listeners.Count -eq 0) {
      return
    }

    foreach ($listener in $listeners) {
      $processId = [int]$listener.OwningProcess
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
      $commandLine = if ($process) { [string]$process.CommandLine } else { "" }
      if ($commandLine -notlike "*$InstallRoot*" -or ($commandLine -notlike "*start-enterprise-web.mjs*" -and $commandLine -notlike "*run-enterprise-web-service.mjs*")) {
        throw "Port $Port is owned by process $processId outside the managed Flash ERP service. It was not stopped."
      }
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Managed Flash ERP processes did not release port $Port within 45 seconds."
}

function Stop-ManagedProcessByScript {
  param(
    [string]$InstallRoot,
    [string]$ScriptName
  )

  $deadline = (Get-Date).AddSeconds(45)
  do {
    $processes = @(
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
          $commandLine = [string]$_.CommandLine
          $commandLine -like "*$InstallRoot*" -and $commandLine -like "*$ScriptName*"
        }
    )
    if ($processes.Count -eq 0) {
      return
    }
    foreach ($process in $processes) {
      Stop-Process -Id ([int]$process.ProcessId) -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)

  throw "Managed Flash ERP processes using $ScriptName did not stop within 45 seconds."
}

function Get-DotEnvValue {
  param(
    [string]$Path,
    [string]$Name
  )

  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^\s*([^#][^=]*)=(.*)$') {
      continue
    }
    if ($Matches[1].Trim() -ne $Name) {
      continue
    }
    $value = $Matches[2].Trim()
    if (
      $value.Length -ge 2 -and
      (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))
    ) {
      return $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return $null
}

function Wait-ForTrialProvisioner {
  param(
    [int]$Port,
    [string]$ExpectedRelease,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1
      $process = Get-CimInstance Win32_Process -Filter "ProcessId = $([int]$listener.OwningProcess)" -ErrorAction Stop
      $commandLine = [string]$process.CommandLine
      if ($commandLine -notlike "*$ExpectedRelease*" -or $commandLine -notlike "*run-trial-provisioner-service.mjs*") {
        throw "Port $Port is not owned by the expected trial provisioner release."
      }
      $response = Invoke-CheckedGet -Uri "http://127.0.0.1:$Port/health" -Label "Trial provisioner health"
      $health = $response.Content | ConvertFrom-Json
      if ($health.ok -ne $true) {
        throw "The trial provisioner health response did not report ok=true."
      }
      Write-Host "Trial provisioner is owned by the new release and reports ok=true." -ForegroundColor Green
      return
    } catch {
      Start-Sleep -Seconds 3
    }
  } while ((Get-Date) -lt $deadline)

  throw "The trial provisioner did not become healthy under $ExpectedRelease within $TimeoutSeconds seconds."
}

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$manifestPath = Join-Path $packageRoot "release-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "The release package is missing release-manifest.json."
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$payloadPath = Join-Path $packageRoot ([string]$manifest.payloadFile)
if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) {
  throw "The release package is missing payload $($manifest.payloadFile)."
}
$actualPayloadHash = (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash
if ($actualPayloadHash -ne [string]$manifest.payloadSha256) {
  throw "The runtime payload checksum does not match release-manifest.json. Expected $($manifest.payloadSha256), received $actualPayloadHash."
}

if ($ValidateLayoutRoot) {
  Assert-PayloadLayout `
    -Root $ValidateLayoutRoot `
    -Manifest $manifest `
    -Hydrated:$HydratedLayout `
    -ExpectedNodeModules $ExpectedNodeModulesTarget `
    -ExpectedUploads $ExpectedUploadsTarget `
    -ExpectedEnvironment $ExpectedEnvironmentSource
  Write-Host "Runtime layout validation passed for $ValidateLayoutRoot." -ForegroundColor Green
  exit 0
}

# This is deliberately before administrator validation and every filesystem write.
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  throw "Scheduled task '$TaskName' does not exist. No deployment files were written."
}

Assert-Administrator

$installRoot = "C:\FlashRMS"
$releaseId = [string]$manifest.releaseId
$targetRelease = Join-Path (Join-Path $installRoot "releases") "FlashRMS-$releaseId"
if (Test-Path -LiteralPath $targetRelease) {
  throw "Release directory already exists and will not be overwritten: $targetRelease. Build a package with a fresh release ID."
}

$previousActions = @($task.Actions)
$activeRelease = Get-ActiveReleaseRoot -Actions $previousActions -InstallRoot $installRoot
$activeNodeModules = Join-Path $activeRelease "node_modules"
$nodeModulesTarget = Get-JunctionTarget -Path $activeNodeModules
$nodeExe = Get-RuntimeNode -InstallRoot $installRoot
$envCandidates = @(
  (Join-Path (Join-Path $installRoot "shared") ".env"),
  (Join-Path $activeRelease ".env"),
  (Join-Path $installRoot ".env")
)
$environmentSource = $envCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $environmentSource) {
  throw "No current VPS environment file was found in the shared, active-release, or install-root locations. The scheduled task was not changed."
}
$trialProvisionerEnabled = (Get-DotEnvValue -Path $environmentSource -Name "FLASH_ERP_TRIAL_PROVISIONER_ENABLED") -eq "true"
$trialProvisionerPort = 3099
$configuredTrialProvisionerPort = Get-DotEnvValue -Path $environmentSource -Name "FLASH_ERP_TRIAL_PROVISIONER_PORT"
$parsedTrialProvisionerPort = 0
if (
  $configuredTrialProvisionerPort -and
  [int]::TryParse($configuredTrialProvisionerPort, [ref]$parsedTrialProvisionerPort) -and
  $parsedTrialProvisionerPort -ge 1024 -and
  $parsedTrialProvisionerPort -le 65535
) {
  $trialProvisionerPort = $parsedTrialProvisionerPort
}

Write-Step "Preflight complete for release $releaseId"
Write-Host "Active release: $activeRelease"
Write-Host "Reusable node_modules: $nodeModulesTarget"
Write-Host "Managed Node runtime: $nodeExe"
Write-Host "Environment source: $environmentSource"
if ($PreflightOnly) {
  Write-Host "Preflight-only mode completed without creating staging or release directories." -ForegroundColor Green
  exit 0
}

$attemptId = [Guid]::NewGuid().ToString("N")
$stagingRoot = Join-Path (Join-Path $installRoot "staging") "FlashRMS-$releaseId-$attemptId"
$sharedUploads = Join-Path (Join-Path $installRoot "shared") "uploads"
$taskSwitched = $false

try {
  Write-Step "Extracting and validating the checksum-protected runtime payload"
  New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null
  Expand-Archive -LiteralPath $payloadPath -DestinationPath $stagingRoot
  Assert-PayloadLayout -Root $stagingRoot -Manifest $manifest

  Copy-Item -LiteralPath $environmentSource -Destination (Join-Path $stagingRoot ".env")
  New-DirectoryJunction -Path (Join-Path $stagingRoot "node_modules") -Target $nodeModulesTarget

  if (-not (Test-Path -LiteralPath $sharedUploads)) {
    New-Item -ItemType Directory -Path $sharedUploads -Force | Out-Null
    $activeUploads = Join-Path $activeRelease "apps\enterprise-web\public\uploads"
    if (Test-Path -LiteralPath $activeUploads) {
      Invoke-Robocopy -Source $activeUploads -Destination $sharedUploads
    }
  }
  New-DirectoryJunction -Path (Join-Path $stagingRoot "apps\enterprise-web\public\uploads") -Target $sharedUploads

  Assert-PayloadLayout `
    -Root $stagingRoot `
    -Manifest $manifest `
    -Hydrated `
    -ExpectedNodeModules $nodeModulesTarget `
    -ExpectedUploads $sharedUploads `
    -ExpectedEnvironment $environmentSource

  Write-Step "Promoting the immutable release directory"
  Move-Item -LiteralPath $stagingRoot -Destination $targetRelease

  Write-Step "Applying migrations and regenerating Prisma Client with the VPS runtime Node"
  Push-Location $targetRelease
  try {
    $prismaCli = Join-Path $targetRelease "node_modules\prisma\build\index.js"
    if (-not (Test-Path -LiteralPath $prismaCli -PathType Leaf)) {
      throw "Prisma CLI is missing from the reused dependency tree: $prismaCli"
    }
    & $nodeExe $prismaCli migrate deploy --schema (Join-Path $targetRelease "prisma\schema.prisma")
    if ($LASTEXITCODE -ne 0) {
      throw "Prisma migrate deploy failed with exit code $LASTEXITCODE."
    }
    & $nodeExe $prismaCli generate --schema (Join-Path $targetRelease "prisma\schema.prisma")
    if ($LASTEXITCODE -ne 0) {
      throw "Prisma generate failed with exit code $LASTEXITCODE."
    }
    Assert-RuntimeModuleResolution -Root $targetRelease -NodeExecutable $nodeExe -Manifest $manifest
  } finally {
    Pop-Location
  }

  Assert-PayloadLayout `
    -Root $targetRelease `
    -Manifest $manifest `
    -Hydrated `
    -ExpectedNodeModules $nodeModulesTarget `
    -ExpectedUploads $sharedUploads `
    -ExpectedEnvironment $environmentSource

  Write-Step "Switching $TaskName to the direct Node service host"
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Stop-ManagedListener -Port 3000 -InstallRoot $installRoot
  Stop-ManagedProcessByScript -InstallRoot $installRoot -ScriptName "run-trial-provisioner-service.mjs"
  $serviceScript = Join-Path $targetRelease "scripts\run-enterprise-web-service.mjs"
  $newAction = New-ScheduledTaskAction -Execute $nodeExe -Argument ('"{0}"' -f $serviceScript) -WorkingDirectory $targetRelease
  Set-ScheduledTask -TaskName $TaskName -Action $newAction | Out-Null
  $taskSwitched = $true
  Start-ScheduledTask -TaskName $TaskName

  $localBaseUri = "http://127.0.0.1:3000"
  $publicBaseUri = [string]$manifest.publicBaseUrl
  Wait-ForLocalLive -BaseUri $localBaseUri
  if ($trialProvisionerEnabled) {
    Wait-ForTrialProvisioner -Port $trialProvisionerPort -ExpectedRelease $targetRelease
  }
  Assert-HealthSuite -BaseUri $localBaseUri -StoreCode ([string]$manifest.storeCode) -Label "Local"
  Assert-HealthSuite -BaseUri $publicBaseUri -StoreCode ([string]$manifest.storeCode) -Label "Public"

  Write-Step "Holding a 60-second scheduled-task and port stability window"
  for ($check = 1; $check -le 6; $check += 1) {
    Start-Sleep -Seconds 10
    $currentTask = Get-ScheduledTask -TaskName $TaskName
    if ([string]$currentTask.State -ne "Running") {
      throw "$TaskName left the Running state during stability check $check of 6. Current state: $($currentTask.State)."
    }
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $listener) {
      throw "Port 3000 stopped listening during stability check $check of 6."
    }
    [void](Invoke-CheckedGet -Uri (Join-BaseUri $localBaseUri "api/system/live") -Label "Stability-window live health")
    Write-Host "Stability check $check/6 passed: task Running, port 3000 listening, live endpoint HTTP 200."
  }

  Assert-HealthSuite -BaseUri $localBaseUri -StoreCode ([string]$manifest.storeCode) -Label "Final local"
  Assert-HealthSuite -BaseUri $publicBaseUri -StoreCode ([string]$manifest.storeCode) -Label "Final public"
  $finalTask = Get-ScheduledTask -TaskName $TaskName
  if ([string]$finalTask.State -ne "Running") {
    throw "$TaskName was not Running after final endpoint verification."
  }

  Write-Host "`nFlash ERP release $releaseId is active and stable." -ForegroundColor Green
  Write-Host "Release directory: $targetRelease"
  Write-Host "Previous scheduled-task action was retained in memory throughout deployment for rollback."
} catch {
  Write-Warning "Deployment failed: $($_.Exception.Message)"
  if ($taskSwitched) {
    Write-Warning "Restoring the previous $TaskName scheduled-task action."
    try {
      Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
      Stop-ManagedListener -Port 3000 -InstallRoot $installRoot
      Stop-ManagedProcessByScript -InstallRoot $installRoot -ScriptName "run-trial-provisioner-service.mjs"
      Set-ScheduledTask -TaskName $TaskName -Action $previousActions | Out-Null
      Start-ScheduledTask -TaskName $TaskName
      Wait-ForLocalLive -BaseUri "http://127.0.0.1:3000" -TimeoutSeconds 180
      Write-Host "The previous scheduled-task action was restored and returned to live health." -ForegroundColor Yellow
    } catch {
      Write-Warning "Automatic rollback also failed: $($_.Exception.Message)"
    }
  }
  Write-Warning "Failed staging/release directories were preserved for diagnosis. Do not reuse release ID $releaseId."
  throw
}
