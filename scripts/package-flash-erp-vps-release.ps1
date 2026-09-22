[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9._-]+$")]
  [string]$ReleaseId,
  [string]$StoreCode = "accra-shop",
  [string]$PublicBaseUrl = "http://84.247.188.30:3000",
  [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$trialProvisionerRuntimeFiles = @(
  "apps\enterprise-web\src\server\trials\trial-owner-token.ts",
  "apps\enterprise-web\src\server\trials\trial-sample-catalog.ts",
  "apps\enterprise-web\src\server\trials\trial-sample-data.ts",
  "packages\domain\src\prisma-enums.ts",
  "packages\domain\src\security-permissions.ts",
  "packages\domain\src\trial-support.ts",
  "scripts\manage-flash-erp-trial-workspace.ps1",
  "scripts\run-trial-provisioner-service.mjs",
  "scripts\run-trial-workspace-service.mjs",
  "scripts\trial-sqlserver-url.ts",
  "scripts\trial-support-credentials-core.ts",
  "scripts\trial-workspace-provisioner-worker.ts"
)

function Write-Step {
  param([string]$Message)
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Robocopy {
  param(
    [string]$Source,
    [string]$Destination,
    [string[]]$ExcludedDirectories = @()
  )

  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  $arguments = @($Source, $Destination, "/E", "/XJ", "/R:2", "/W:2", "/NFL", "/NDL", "/NJH", "/NJS", "/NP")
  if ($ExcludedDirectories.Count -gt 0) {
    $arguments += "/XD"
    $arguments += $ExcludedDirectories
  }
  & robocopy.exe @arguments | Out-Null
  if ($LASTEXITCODE -gt 7) {
    throw "Robocopy failed with exit code $LASTEXITCODE while copying $Source to $Destination."
  }
}

function New-ZipFromDirectory {
  param(
    [string]$Source,
    [string]$Destination
  )

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path -LiteralPath $Destination) {
    throw "Archive already exists: $Destination"
  }
  [IO.Compression.ZipFile]::CreateFromDirectory(
    $Source,
    $Destination,
    [IO.Compression.CompressionLevel]::Optimal,
    $false
  )
}

function Assert-NoForbiddenPayloadContent {
  param([string]$Root)

  $forbidden = @(
    "apps\enterprise-web\.next\standalone",
    "apps\enterprise-web\.next\dev",
    "apps\enterprise-web\.next\cache",
    "apps\enterprise-web\public\uploads",
    "node_modules"
  )
  foreach ($relativePath in $forbidden) {
    if (Test-Path -LiteralPath (Join-Path $Root $relativePath)) {
      throw "Forbidden payload path was packaged: $relativePath"
    }
  }

  $environmentFiles = Get-ChildItem -LiteralPath $Root -File -Force -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq ".env" -or $_.Name -like ".env.*" }
  if ($environmentFiles) {
    throw "Environment file was packaged: $($environmentFiles[0].FullName)"
  }
}

function Assert-RuntimePayload {
  param(
    [string]$Root,
    [object[]]$Aliases,
    [string]$DependencyModel,
    [object[]]$RuntimeModules,
    [string]$BuildId
  )

  $required = @(
    "apps\enterprise-web\.next\BUILD_ID",
    "apps\enterprise-web\.next\server",
    "apps\enterprise-web\.next\static",
    "apps\enterprise-web\public",
    "apps\enterprise-web\next.config.mjs",
    "scripts\run-enterprise-web-service.mjs",
    "scripts\start-enterprise-web.mjs",
    "prisma\schema.prisma",
    "prisma\migrations-sqlserver",
    "prisma.config.ts",
    "release-runtime-manifest.json"
  ) + $script:trialProvisionerRuntimeFiles
  foreach ($relativePath in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Root $relativePath))) {
      throw "Required runtime path was not packaged: $relativePath"
    }
  }

  Assert-NoForbiddenPayloadContent -Root $Root

  $supportedDependencyModels = @(
    "reused-root-node-modules",
    "packaged-next-aliases-plus-reused-root-node-modules"
  )
  if ($supportedDependencyModels -notcontains $DependencyModel) {
    throw "Unsupported runtime dependency model: $DependencyModel"
  }
  if (@($RuntimeModules).Count -eq 0) {
    throw "The runtime dependency contract has no required modules."
  }
  foreach ($runtimeModule in @($RuntimeModules)) {
    if ([string]::IsNullOrWhiteSpace([string]$runtimeModule.specifier)) {
      throw "The runtime dependency contract contains an empty module specifier."
    }
  }

  if (@($Aliases).Count -gt 0) {
    if ($DependencyModel -ne "packaged-next-aliases-plus-reused-root-node-modules") {
      throw "Packaged Next aliases require the packaged-aliases runtime dependency model."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $Root "apps\enterprise-web\.next\node_modules") -PathType Container)) {
      throw "The runtime payload is missing its packaged Next dependency aliases."
    }
  } elseif ($DependencyModel -ne "reused-root-node-modules") {
    throw "The runtime dependency model requires aliases, but none were packaged."
  }

  foreach ($alias in $Aliases) {
    $aliasPath = Join-Path $Root (([string]$alias.path).Replace("/", "\"))
    if (-not (Test-Path -LiteralPath $aliasPath -PathType Container)) {
      throw "Runtime alias directory is missing: $aliasPath"
    }
    $aliasItem = Get-Item -LiteralPath $aliasPath -Force
    if (($aliasItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Runtime alias was not materialized into physical files: $aliasPath"
    }
    foreach ($requiredFile in @($alias.requiredFiles)) {
      if (-not (Test-Path -LiteralPath (Join-Path $aliasPath ([string]$requiredFile)) -PathType Leaf)) {
        throw "Runtime alias file is missing: $($alias.path)/$requiredFile"
      }
    }
  }

  $payloadBuildId = (Get-Content -LiteralPath (Join-Path $Root "apps\enterprise-web\.next\BUILD_ID") -Raw).Trim()
  if ($payloadBuildId -ne $BuildId) {
    throw "Runtime payload BUILD_ID '$payloadBuildId' does not match '$BuildId'."
  }
}

function Assert-PowerShell51Parse {
  param([string]$ScriptPath)

  $escapedPath = $ScriptPath.Replace("'", "''")
  $parseCommand = "& { [void][ScriptBlock]::Create((Get-Content -LiteralPath '$escapedPath' -Raw)) }"
  & powershell.exe -NoProfile -NonInteractive -Command $parseCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Windows PowerShell 5.1 could not parse $ScriptPath."
  }
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repositoryRoot "artifacts\releases"
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

$releaseUpper = $ReleaseId.ToUpperInvariant()
$packageName = "FlashERP-HQ-$releaseUpper-VPS-Deploy-Resolved"
$payloadName = "FlashRMS-$ReleaseId-runtime.zip"
$commandName = "Deploy Flash ERP $ReleaseId.cmd"
$deploymentScriptName = "deploy-flash-erp-$ReleaseId.ps1"
$finalPackageDirectory = Join-Path $outputRoot $packageName
$finalOuterZip = Join-Path $outputRoot "$packageName.zip"
$finalOuterHash = "$finalOuterZip.sha256.txt"
foreach ($path in @($finalPackageDirectory, $finalOuterZip, $finalOuterHash)) {
  if (Test-Path -LiteralPath $path) {
    throw "Release output already exists and will not be overwritten: $path. Use a fresh release ID."
  }
}

$workBase = Join-Path ([IO.Path]::GetTempPath()) "flash-erp-vps-packager"
New-Item -ItemType Directory -Path $workBase -Force | Out-Null
$workRoot = Join-Path $workBase ("{0}-{1}" -f $ReleaseId, [Guid]::NewGuid().ToString("N").Substring(0, 8))
$payloadRoot = Join-Path $workRoot "payload"
$packageRoot = Join-Path $workRoot "package"
$payloadVerificationRoot = Join-Path $workRoot "verify-payload"
$outerVerificationRoot = Join-Path $workRoot "verify-outer"
$workOuterZip = Join-Path $workRoot "$packageName.zip"
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null
New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

try {
  $nextSource = Join-Path $repositoryRoot "apps\enterprise-web\.next"
  $buildIdPath = Join-Path $nextSource "BUILD_ID"
  if (-not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)) {
    throw "Enterprise Web production output is missing. Run npm run build:deploy before packaging."
  }
  $buildId = (Get-Content -LiteralPath $buildIdPath -Raw).Trim()

  Write-Step "Copying normal Next runtime output and materializing dependency aliases"
  $nextDestination = Join-Path $payloadRoot "apps\enterprise-web\.next"
  Invoke-Robocopy -Source $nextSource -Destination $nextDestination -ExcludedDirectories @(
    (Join-Path $nextSource "cache"),
    (Join-Path $nextSource "dev"),
    (Join-Path $nextSource "standalone")
  )

  $aliasSourceRoot = Join-Path $nextSource "node_modules"
  $aliasLinks = @(Get-ChildItem -LiteralPath $aliasSourceRoot -Directory -Force -Recurse -Attributes ReparsePoint -ErrorAction SilentlyContinue)
  $aliases = New-Object System.Collections.Generic.List[object]
  foreach ($aliasLink in $aliasLinks) {
    $relativeToNext = $aliasLink.FullName.Substring($nextSource.Length + 1)
    $aliasDestination = Join-Path $nextDestination $relativeToNext
    Invoke-Robocopy -Source $aliasLink.FullName -Destination $aliasDestination
    $packageJsonPath = Join-Path $aliasDestination "package.json"
    if (-not (Test-Path -LiteralPath $packageJsonPath -PathType Leaf)) {
      throw "Materialized runtime alias is missing package.json: $aliasDestination"
    }

    $packageMetadata = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
    $mainRelativePath = ([string]$packageMetadata.main).Replace("/", "\")
    if ($mainRelativePath.StartsWith(".\")) {
      $mainRelativePath = $mainRelativePath.Substring(2)
    }
    if (
      [string]::IsNullOrWhiteSpace($mainRelativePath) -or
      [IO.Path]::IsPathRooted($mainRelativePath) -or
      @($mainRelativePath.Split("\") | Where-Object { $_ -eq ".." }).Count -gt 0
    ) {
      throw "Runtime alias has no safe package main entrypoint: $aliasDestination"
    }

    $requiredFiles = @("package.json", $mainRelativePath)
    if ($relativeToNext.Replace("\", "/") -like "node_modules/@prisma/client-*") {
      $requiredFiles += "index.js"
    }
    $requiredFiles = @($requiredFiles | Select-Object -Unique)
    foreach ($requiredFile in $requiredFiles) {
      if (-not (Test-Path -LiteralPath (Join-Path $aliasDestination $requiredFile) -PathType Leaf)) {
        throw "Materialized runtime alias is missing $requiredFile`: $aliasDestination"
      }
    }
    $aliases.Add([PSCustomObject]@{
      path = ("apps/enterprise-web/.next/{0}" -f $relativeToNext.Replace("\", "/"))
      requiredFiles = $requiredFiles
    })
  }
  $aliasArray = @($aliases.ToArray())

  if ($aliasArray.Count -gt 0) {
    $runtimeDependencyModel = "packaged-next-aliases-plus-reused-root-node-modules"
    $prismaAliases = @($aliasArray | Where-Object { $_.path -like "*/node_modules/@prisma/client-*" })
    if ($prismaAliases.Count -eq 0) {
      throw "The package has Next runtime aliases but no materialized @prisma/client hashed alias."
    }
  } else {
    $runtimeDependencyModel = "reused-root-node-modules"
    $prismaTraceFound = $false
    $traceFiles = @(Get-ChildItem -LiteralPath (Join-Path $nextSource "server") -Filter "*.nft.json" -File -Recurse -ErrorAction SilentlyContinue)
    foreach ($traceFile in $traceFiles) {
      $traceContent = [IO.File]::ReadAllText($traceFile.FullName).Replace("\", "/")
      if ($traceContent.Contains("node_modules/@prisma/client/")) {
        $prismaTraceFound = $true
        break
      }
    }
    if (-not $prismaTraceFound) {
      throw "The Webpack server traces do not contain @prisma/client; refusing to package an unverified dependency layout."
    }

    $standaloneModules = Join-Path $nextSource "standalone\node_modules"
    foreach ($relativePath in @(
      "@prisma\client\package.json",
      "@prisma\client\default.js",
      ".prisma\client\package.json",
      ".prisma\client\index.js"
    )) {
      if (-not (Test-Path -LiteralPath (Join-Path $standaloneModules $relativePath) -PathType Leaf)) {
        throw "The Webpack standalone trace is missing required Prisma runtime file: $relativePath"
      }
    }
    Write-Host "Webpack runtime dependencies are traced as normal modules; the release will reuse the governed root node_modules junction."
  }

  $runtimeModules = @(
    [PSCustomObject]@{
      specifier = "@prisma/client"
      requiredExport = "PrismaClient"
    },
    [PSCustomObject]@{
      specifier = "next/package.json"
      requiredExport = ""
    }
  )

  Write-Step "Copying public assets, service hosts, Prisma schema, and SQL Server migrations"
  $webSource = Join-Path $repositoryRoot "apps\enterprise-web"
  $webDestination = Join-Path $payloadRoot "apps\enterprise-web"
  Invoke-Robocopy -Source (Join-Path $webSource "public") -Destination (Join-Path $webDestination "public") -ExcludedDirectories @(
    (Join-Path (Join-Path $webSource "public") "uploads")
  )
  Copy-Item -LiteralPath (Join-Path $webSource "next.config.mjs") -Destination $webDestination
  Copy-Item -LiteralPath (Join-Path $webSource "package.json") -Destination $webDestination

  $scriptsDestination = Join-Path $payloadRoot "scripts"
  New-Item -ItemType Directory -Path $scriptsDestination -Force | Out-Null
  foreach ($scriptName in @("run-enterprise-web-service.mjs", "start-enterprise-web.mjs")) {
    Copy-Item -LiteralPath (Join-Path $repositoryRoot "scripts\$scriptName") -Destination $scriptsDestination
  }

  foreach ($relativePath in $trialProvisionerRuntimeFiles) {
    $sourcePath = Join-Path $repositoryRoot $relativePath
    $destinationPath = Join-Path $payloadRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $destinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath
  }

  $prismaDestination = Join-Path $payloadRoot "prisma"
  New-Item -ItemType Directory -Path $prismaDestination -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repositoryRoot "prisma\schema.prisma") -Destination $prismaDestination
  Invoke-Robocopy -Source (Join-Path $repositoryRoot "prisma\migrations-sqlserver") -Destination (Join-Path $prismaDestination "migrations-sqlserver")
  Copy-Item -LiteralPath (Join-Path $repositoryRoot "prisma.config.ts") -Destination $payloadRoot
  Copy-Item -LiteralPath (Join-Path $repositoryRoot "package.json") -Destination $payloadRoot
  Copy-Item -LiteralPath (Join-Path $repositoryRoot "package-lock.json") -Destination $payloadRoot

  $sourceCommit = (& git -C $repositoryRoot rev-parse --short=7 HEAD).Trim()
  $sourceStatus = @(& git -C $repositoryRoot status --porcelain)
  $sourceDirty = $sourceStatus.Count -gt 0
  $migrationNames = @(Get-ChildItem -LiteralPath (Join-Path $repositoryRoot "prisma\migrations-sqlserver") -Directory | Sort-Object Name | Select-Object -ExpandProperty Name)
  $runtimeManifest = [ordered]@{
    releaseId = $ReleaseId
    createdAtUtc = [DateTime]::UtcNow.ToString("o")
    sourceCommit = $sourceCommit
    sourceDirty = $sourceDirty
    buildId = $buildId
    runtimeDependencyModel = $runtimeDependencyModel
    requiredRuntimeModules = $runtimeModules
    requiredRuntimeAliases = $aliasArray
    requiredTrialProvisionerFiles = $trialProvisionerRuntimeFiles
    requiredMigrations = $migrationNames
  }
  $runtimeManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $payloadRoot "release-runtime-manifest.json") -Encoding UTF8
  Assert-RuntimePayload -Root $payloadRoot -Aliases $aliasArray -DependencyModel $runtimeDependencyModel -RuntimeModules $runtimeModules -BuildId $buildId
  Assert-PowerShell51Parse -ScriptPath (Join-Path $payloadRoot "scripts\manage-flash-erp-trial-workspace.ps1")

  Write-Step "Creating and re-extracting the inner runtime ZIP"
  $payloadZip = Join-Path $packageRoot $payloadName
  New-ZipFromDirectory -Source $payloadRoot -Destination $payloadZip
  $payloadHash = (Get-FileHash -LiteralPath $payloadZip -Algorithm SHA256).Hash
  New-Item -ItemType Directory -Path $payloadVerificationRoot -Force | Out-Null
  Expand-Archive -LiteralPath $payloadZip -DestinationPath $payloadVerificationRoot
  Assert-RuntimePayload -Root $payloadVerificationRoot -Aliases $aliasArray -DependencyModel $runtimeDependencyModel -RuntimeModules $runtimeModules -BuildId $buildId
  Assert-PowerShell51Parse -ScriptPath (Join-Path $payloadVerificationRoot "scripts\manage-flash-erp-trial-workspace.ps1")

  Write-Step "Generating the flat operator-facing package"
  $deploymentScriptSource = Join-Path $repositoryRoot "scripts\deploy-flash-erp-vps-release.ps1"
  $deploymentScriptPath = Join-Path $packageRoot $deploymentScriptName
  Copy-Item -LiteralPath $deploymentScriptSource -Destination $deploymentScriptPath
  $releaseManifest = [ordered]@{
    packageVersion = 2
    releaseId = $ReleaseId
    createdAtUtc = [DateTime]::UtcNow.ToString("o")
    sourceCommit = $sourceCommit
    sourceDirty = $sourceDirty
    buildId = $buildId
    storeCode = $StoreCode
    publicBaseUrl = $PublicBaseUrl
    payloadFile = $payloadName
    payloadSha256 = $payloadHash
    deploymentScript = $deploymentScriptName
    commandFile = $commandName
    runtimeDependencyModel = $runtimeDependencyModel
    requiredRuntimeModules = $runtimeModules
    requiredRuntimeAliases = $aliasArray
    requiredTrialProvisionerFiles = $trialProvisionerRuntimeFiles
    requiredMigrations = $migrationNames
  }
  $releaseManifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $packageRoot "release-manifest.json") -Encoding UTF8
  "$payloadHash  $payloadName" | Set-Content -LiteralPath (Join-Path $packageRoot "$payloadName.sha256.txt") -Encoding ASCII

  $commandContent = @"
@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0$deploymentScriptName"
set "FLASH_ERP_EXIT_CODE=%ERRORLEVEL%"
if not "%FLASH_ERP_EXIT_CODE%"=="0" pause
exit /b %FLASH_ERP_EXIT_CODE%
"@
  $commandContent | Set-Content -LiteralPath (Join-Path $packageRoot $commandName) -Encoding ASCII

  $readmeContent = @"
FLASH ERP WINDOWS VPS RELEASE $ReleaseId
========================================

Target: $PublicBaseUrl
Scheduled task: FlashRMSHQ
Release directory: C:\FlashRMS\releases\FlashRMS-$ReleaseId

1. Copy $packageName.zip to C:\Users\Demo\Desktop on the VPS.
2. Open an elevated Windows PowerShell window (Run as administrator).
3. Extract the ZIP into its own folder:

   Expand-Archive -LiteralPath '.\$packageName.zip' -DestinationPath '.\$packageName'

4. Enter the extracted folder:

   Set-Location '.\$packageName'

5. Confirm the deploy command is present:

   Get-ChildItem -LiteralPath '.\$commandName'

6. Run the deployment command exactly as follows:

   & '.\$commandName'

The deployer verifies the payload checksum, refuses release-directory reuse, reuses and executable-checks the active dependency tree, restores the current VPS .env, preserves uploads, applies SQL Server migrations, regenerates Prisma Client with the managed VPS Node runtime, validates any Next dependency aliases that the build actually emits, switches FlashRMSHQ to scripts\run-enterprise-web-service.mjs, and automatically restores the prior task action if sustained health fails.

Success requires FlashRMSHQ to remain Running, port 3000 to remain listening for 60 seconds, database readiness ready=true, and HTTP 200 from local and public live/readiness/catalog/storefront plus configured hero images.

TRIAL WORKSPACE PREREQUISITES
-----------------------------

Before deployment, add the trial provisioner settings from .env.example to the active VPS .env. The deployer deliberately preserves that existing environment file; secrets are never included in this ZIP.

Required settings include FLASH_ERP_TRIAL_PROVISIONER_ENABLED=true, a strong FLASH_ERP_TRIAL_PROVISIONER_SECRET, FLASH_ERP_TRIAL_SQL_ADMIN_URL with controlled CREATE DATABASE rights, the runtime/task/port settings, FLASH_ERP_TRIAL_CONTROL_PLANE_URL, and FLASH_ERP_TRIAL_PUBLIC_URL_TEMPLATE. Keep FLASH_ERP_TRIAL_EXPOSE_OTP and FLASH_ERP_TRIAL_EXPOSE_ACTIVATION false outside disposable local testing. Configure SMTP so OTP and owner activation links are delivered by email.

Preferred public access uses HTTPS plus a governed proxy and keeps FLASH_ERP_TRIAL_RUNTIME_HOST=127.0.0.1. Temporary direct-port UAT may use a template such as http://SERVER:{port}, FLASH_ERP_TRIAL_RUNTIME_HOST=0.0.0.0, and FLASH_ERP_TRIAL_ALLOW_INSECURE_URLS=true only when the selected trial port range is explicitly allowed through the VPS firewall. Do not use that HTTP posture for production trials.

After deployment, confirm the local provisioner before registering a trial:

   Invoke-RestMethod -Uri 'http://127.0.0.1:3099/health'

It must return ok=true and reconciliation.status=succeeded. Persisted verified requests that were waiting while the provisioner was unavailable are replayed automatically on startup. A verified signup then creates its own SQL Server database, app directory, scheduled task, port, owner invitation, full owner role, and 14-day expiry. Expiry retains the database for audit but stops access; an authorised extension restarts the same workspace without restoring revoked sessions.

Do not delete or reuse a failed C:\FlashRMS\releases\FlashRMS-$ReleaseId directory. Build a package with a new release ID for any retry.
"@
  $readmeContent | Set-Content -LiteralPath (Join-Path $packageRoot "README-FIRST.txt") -Encoding UTF8

  Assert-PowerShell51Parse -ScriptPath $deploymentScriptPath

  Write-Step "Creating and re-extracting the outer operator ZIP"
  New-ZipFromDirectory -Source $packageRoot -Destination $workOuterZip
  New-Item -ItemType Directory -Path $outerVerificationRoot -Force | Out-Null
  Expand-Archive -LiteralPath $workOuterZip -DestinationPath $outerVerificationRoot
  foreach ($rootFile in @($commandName, $deploymentScriptName, "release-manifest.json", $payloadName, "$payloadName.sha256.txt", "README-FIRST.txt")) {
    if (-not (Test-Path -LiteralPath (Join-Path $outerVerificationRoot $rootFile) -PathType Leaf)) {
      throw "The outer ZIP does not expose required file at archive root: $rootFile"
    }
  }
  Assert-PowerShell51Parse -ScriptPath (Join-Path $outerVerificationRoot $deploymentScriptName)
  $outerManifest = Get-Content -LiteralPath (Join-Path $outerVerificationRoot "release-manifest.json") -Raw | ConvertFrom-Json
  $outerPayload = Join-Path $outerVerificationRoot ([string]$outerManifest.payloadFile)
  $outerPayloadHash = (Get-FileHash -LiteralPath $outerPayload -Algorithm SHA256).Hash
  if ($outerPayloadHash -ne [string]$outerManifest.payloadSha256) {
    throw "The outer extracted payload checksum does not match its manifest."
  }

  Write-Step "Executing the packaged runtime dependency smoke"
  & powershell.exe `
    -NoProfile `
    -NonInteractive `
    -ExecutionPolicy Bypass `
    -File (Join-Path $repositoryRoot "scripts\smoke-flash-erp-vps-release-package.ps1") `
    -PackageDirectory $packageRoot
  if ($LASTEXITCODE -ne 0) {
    throw "The packaged runtime dependency smoke failed."
  }

  Write-Step "Exercising the hydrated release layout regression gate"
  $fixtureNodeModules = Join-Path $workRoot "fixture-node-modules"
  $fixtureUploads = Join-Path $workRoot "fixture-uploads"
  $fixtureEnvironment = Join-Path $workRoot "fixture-environment.env"
  New-Item -ItemType Directory -Path $fixtureNodeModules -Force | Out-Null
  New-Item -ItemType Directory -Path $fixtureUploads -Force | Out-Null
  "PACKAGE_LAYOUT_SELF_TEST=true" | Set-Content -LiteralPath $fixtureEnvironment -Encoding ASCII
  $hydratedEnvironment = Join-Path $payloadVerificationRoot ".env"
  $hydratedNodeModules = Join-Path $payloadVerificationRoot "node_modules"
  $hydratedUploads = Join-Path $payloadVerificationRoot "apps\enterprise-web\public\uploads"
  try {
    Copy-Item -LiteralPath $fixtureEnvironment -Destination $hydratedEnvironment
    New-Item -ItemType Junction -Path $hydratedNodeModules -Target $fixtureNodeModules | Out-Null
    New-Item -ItemType Junction -Path $hydratedUploads -Target $fixtureUploads | Out-Null
    & powershell.exe `
      -NoProfile `
      -NonInteractive `
      -ExecutionPolicy Bypass `
      -File (Join-Path $outerVerificationRoot $deploymentScriptName) `
      -ValidateLayoutRoot $payloadVerificationRoot `
      -HydratedLayout `
      -ExpectedNodeModulesTarget $fixtureNodeModules `
      -ExpectedUploadsTarget $fixtureUploads `
      -ExpectedEnvironmentSource $fixtureEnvironment
    if ($LASTEXITCODE -ne 0) {
      throw "The packaged deployer rejected the approved hydrated release layout."
    }
  } finally {
    foreach ($junction in @($hydratedNodeModules, $hydratedUploads)) {
      if (Test-Path -LiteralPath $junction) {
        (Get-Item -LiteralPath $junction -Force).Delete()
      }
    }
    if (Test-Path -LiteralPath $hydratedEnvironment) {
      Remove-Item -LiteralPath $hydratedEnvironment -Force
    }
  }

  Write-Step "Exercising the no-write missing-task preflight guard"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $guardOutput = & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $outerVerificationRoot $deploymentScriptName) -PreflightOnly -TaskName "__FLASH_ERP_PACKAGE_GUARD_MISSING_TASK__" 2>&1
    $guardExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($guardExitCode -eq 0 -or (($guardOutput | Out-String) -notmatch "No\s+deployment\s+files\s+were\s+written")) {
    throw "The missing-task no-write guard did not fail in the expected way. Output: $($guardOutput | Out-String)"
  }

  Move-Item -LiteralPath $packageRoot -Destination $finalPackageDirectory
  Move-Item -LiteralPath $workOuterZip -Destination $finalOuterZip
  $outerHash = (Get-FileHash -LiteralPath $finalOuterZip -Algorithm SHA256).Hash
  "$outerHash  $packageName.zip" | Set-Content -LiteralPath $finalOuterHash -Encoding ASCII

  Write-Host "`nRelease package completed and verified." -ForegroundColor Green
  Write-Host "ZIP: $finalOuterZip"
  Write-Host "ZIP SHA-256: $outerHash"
  Write-Host "Extracted inspection folder: $finalPackageDirectory"
  Write-Host "VPS command: & '.\$commandName'"
} finally {
  if (Test-Path -LiteralPath $workRoot) {
    $resolvedWork = [IO.Path]::GetFullPath($workRoot)
    $resolvedWorkBase = [IO.Path]::GetFullPath($workBase).TrimEnd("\") + "\"
    if (-not $resolvedWork.StartsWith($resolvedWorkBase, [StringComparison]::OrdinalIgnoreCase)) {
      Write-Warning "Refusing to remove unexpected work directory: $resolvedWork"
    } else {
      try {
        Remove-Item -LiteralPath $resolvedWork -Recurse -Force
      } catch {
        Write-Warning "Could not remove disposable packaging directory $resolvedWork`: $($_.Exception.Message)"
      }
    }
  }
}
