[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$packageRoot = (Resolve-Path -LiteralPath $PackageDirectory).Path
$manifestPath = Join-Path $packageRoot "release-manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Release manifest is missing: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$payloadPath = Join-Path $packageRoot ([string]$manifest.payloadFile)
if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) {
  throw "Runtime payload is missing: $payloadPath"
}

$expectedHash = [string]$manifest.payloadSha256
$actualHash = (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) {
  throw "Runtime payload checksum mismatch. Expected $expectedHash, received $actualHash."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodeModules = (Resolve-Path (Join-Path $repositoryRoot "node_modules")).Path
$smokeBase = Join-Path ([IO.Path]::GetTempPath()) "flash-erp-package-smoke"
$smokeRoot = Join-Path $smokeBase ("{0}-{1}" -f $manifest.releaseId, [Guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Path $smokeRoot -Force | Out-Null
$smokeNodeModules = Join-Path $smokeRoot "node_modules"

try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($payloadPath)
  try {
    foreach ($alias in @($manifest.requiredRuntimeAliases)) {
      $prefix = ([string]$alias.path).TrimEnd("/") + "/"
      $entries = @($archive.Entries | Where-Object {
        $_.FullName.Replace("\", "/").StartsWith($prefix, [StringComparison]::Ordinal)
      })
      if ($entries.Count -eq 0) {
        throw "Runtime alias has no archive entries: $($alias.path)"
      }

      foreach ($entry in $entries) {
        $destination = Join-Path $smokeRoot $entry.FullName.Replace("/", "\")
        if ($entry.FullName.EndsWith("/")) {
          New-Item -ItemType Directory -Path $destination -Force | Out-Null
          continue
        }

        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        $input = $entry.Open()
        try {
          $output = [IO.File]::Create($destination)
          try {
            $input.CopyTo($output)
          } finally {
            $output.Dispose()
          }
        } finally {
          $input.Dispose()
        }
      }
    }
  } finally {
    $archive.Dispose()
  }

  $dependencyModel = [string]$manifest.runtimeDependencyModel
  $supportedDependencyModels = @(
    "reused-root-node-modules",
    "packaged-next-aliases-plus-reused-root-node-modules"
  )
  if ($supportedDependencyModels -notcontains $dependencyModel) {
    throw "Unsupported runtime dependency model: $dependencyModel"
  }

  New-Item -ItemType Junction -Path $smokeNodeModules -Target $nodeModules | Out-Null
  $runtimeBase = Join-Path $smokeRoot "apps\enterprise-web\.next\server"
  New-Item -ItemType Directory -Path $runtimeBase -Force | Out-Null

  $runtimeModules = @($manifest.requiredRuntimeModules)
  if ($runtimeModules.Count -eq 0) {
    throw "The package manifest has no required runtime modules."
  }
  $env:FLASH_ERP_SMOKE_RUNTIME_BASE = $runtimeBase
  $env:FLASH_ERP_SMOKE_RUNTIME_MODULES = ConvertTo-Json -InputObject $runtimeModules -Compress -Depth 4
  $runtimeSmokeScript = Join-Path $smokeRoot "runtime-module-smoke.cjs"
  @'
const path = require("node:path");
const { createRequire } = require("node:module");
const runtimeRequire = createRequire(
  path.join(process.env.FLASH_ERP_SMOKE_RUNTIME_BASE, "flash-erp-runtime-smoke.cjs"),
);
const checks = JSON.parse(process.env.FLASH_ERP_SMOKE_RUNTIME_MODULES);
for (const check of checks) {
  const loaded = runtimeRequire(check.specifier);
  if (check.requiredExport && typeof loaded[check.requiredExport] === "undefined") {
    throw new Error(`${check.specifier} does not export ${check.requiredExport}`);
  }
}
process.stdout.write("PACKAGED_RUNTIME_MODULE_RESOLUTION=OK\n");
'@ | Set-Content -LiteralPath $runtimeSmokeScript -Encoding ASCII
  & node.exe $runtimeSmokeScript
  if ($LASTEXITCODE -ne 0) {
    throw "Packaged runtime module resolution failed with exit code $LASTEXITCODE."
  }

  $prismaAlias = @($manifest.requiredRuntimeAliases | Where-Object {
    $_.path -like "*/@prisma/client-*"
  }) | Select-Object -First 1
  if ($prismaAlias) {
    $env:FLASH_ERP_SMOKE_ALIAS = Join-Path $smokeRoot ([string]$prismaAlias.path).Replace("/", "\")
    & node.exe -e @"
const client = require(process.env.FLASH_ERP_SMOKE_ALIAS);
if (typeof client.PrismaClient !== 'function') {
  throw new Error('PrismaClient export is missing');
}
process.stdout.write('PACKAGED_PRISMA_ALIAS_REQUIRE=OK\n');
"@
    if ($LASTEXITCODE -ne 0) {
      throw "Packaged Prisma alias require smoke failed with exit code $LASTEXITCODE."
    }
  }

  Write-Host "Release package executable dependency smoke passed." -ForegroundColor Green
  Write-Host "Release: $($manifest.releaseId)"
  Write-Host "Dependency model: $dependencyModel"
  Write-Host "Runtime modules resolved: $($runtimeModules.Count)"
  Write-Host "Aliases extracted: $(@($manifest.requiredRuntimeAliases).Count)"
} finally {
  $env:FLASH_ERP_SMOKE_ALIAS = $null
  $env:FLASH_ERP_SMOKE_RUNTIME_BASE = $null
  $env:FLASH_ERP_SMOKE_RUNTIME_MODULES = $null
  if (Test-Path -LiteralPath $smokeNodeModules) {
    $smokeNodeModulesItem = Get-Item -LiteralPath $smokeNodeModules -Force
    if (($smokeNodeModulesItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      $smokeNodeModulesItem.Delete()
    }
  }
  if (Test-Path -LiteralPath $smokeRoot) {
    $resolvedSmoke = [IO.Path]::GetFullPath($smokeRoot)
    $resolvedBase = [IO.Path]::GetFullPath($smokeBase).TrimEnd("\") + "\"
    if (-not $resolvedSmoke.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase)) {
      throw "Refusing to remove unexpected smoke directory: $resolvedSmoke"
    }
    Remove-Item -LiteralPath $resolvedSmoke -Recurse -Force
  }
}
