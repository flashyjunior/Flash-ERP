param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Ensure", "Start", "Stop")]
  [string]$Action,
  [Parameter(Mandatory = $true)]
  [string]$WorkspaceSlug,
  [Parameter(Mandatory = $true)]
  [string]$ConfigPath,
  [Parameter(Mandatory = $true)]
  [int]$Port,
  [Parameter(Mandatory = $true)]
  [string]$ReleaseRoot,
  [Parameter(Mandatory = $true)]
  [string]$RuntimeRoot,
  [Parameter(Mandatory = $true)]
  [string]$NodePath,
  [string]$TaskPrefix = "FlashERPTrial-"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Resolve-NormalizedPath([string]$PathValue) {
  return [System.IO.Path]::GetFullPath($PathValue).TrimEnd('\')
}

function Assert-ChildPath([string]$Parent, [string]$Child, [string]$Label) {
  $parentPath = Resolve-NormalizedPath $Parent
  $childPath = Resolve-NormalizedPath $Child
  if (-not $childPath.StartsWith($parentPath + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must remain inside $parentPath."
  }
  return $childPath
}

if ($WorkspaceSlug -notmatch '^[a-z0-9][a-z0-9-]{2,79}$') {
  throw "WorkspaceSlug contains unsupported characters."
}
if ($TaskPrefix -notmatch '^[A-Za-z0-9-]{3,40}$') {
  throw "TaskPrefix contains unsupported characters."
}
if ($Port -lt 1024 -or $Port -gt 65535) {
  throw "Port must be between 1024 and 65535."
}

$runtimeRootPath = Resolve-NormalizedPath $RuntimeRoot
$workspaceRoot = Assert-ChildPath $runtimeRootPath (Join-Path $runtimeRootPath $WorkspaceSlug) "Workspace path"
$appRoot = Assert-ChildPath $workspaceRoot (Join-Path $workspaceRoot "app") "Trial app path"
$configFile = Assert-ChildPath $workspaceRoot $ConfigPath "Trial configuration path"
$releaseRootPath = Resolve-NormalizedPath $ReleaseRoot
$nodePathValue = Resolve-NormalizedPath $NodePath
$taskName = "$TaskPrefix$WorkspaceSlug"

if (-not (Test-Path -LiteralPath $nodePathValue -PathType Leaf)) {
  throw "The managed Node runtime does not exist at $nodePathValue."
}
if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) {
  throw "The trial configuration file does not exist at $configFile."
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($Action -eq "Stop") {
  if ($task) {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  }
  exit 0
}

if ($Action -eq "Start") {
  if (-not $task) {
    throw "Scheduled task $taskName does not exist. Run Ensure first."
  }
  Start-ScheduledTask -TaskName $taskName
  exit 0
}

if ($task) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Path $workspaceRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $workspaceRoot "logs") -Force | Out-Null
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null

$robocopyArguments = @(
  $releaseRootPath,
  $appRoot,
  "/E",
  "/R:2",
  "/W:1",
  "/NFL",
  "/NDL",
  "/NJH",
  "/NJS",
  "/NP",
  "/XD",
  (Join-Path $releaseRootPath "node_modules"),
  (Join-Path $releaseRootPath "logs"),
  (Join-Path $releaseRootPath ".git"),
  (Join-Path $releaseRootPath "apps\enterprise-web\public\uploads"),
  "/XF",
  (Join-Path $releaseRootPath ".env")
)
& robocopy @robocopyArguments | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Robocopy failed while hydrating the isolated trial application. Exit code: $LASTEXITCODE."
}

$sourceNodeModules = Join-Path $releaseRootPath "node_modules"
$trialNodeModules = Join-Path $appRoot "node_modules"
if (-not (Test-Path -LiteralPath $sourceNodeModules -PathType Container)) {
  throw "The active release node_modules directory is missing."
}
if (-not (Test-Path -LiteralPath $trialNodeModules)) {
  New-Item -ItemType Junction -Path $trialNodeModules -Target $sourceNodeModules | Out-Null
}

$trialUploads = Join-Path $appRoot "apps\enterprise-web\public\uploads"
New-Item -ItemType Directory -Path $trialUploads -Force | Out-Null

& icacls.exe $configFile /inheritance:r /grant:r 'SYSTEM:F' '*S-1-5-32-544:F' | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Flash ERP could not restrict the trial workspace configuration ACL."
}

$serviceScript = Join-Path $appRoot "scripts\run-trial-workspace-service.mjs"
if (-not (Test-Path -LiteralPath $serviceScript -PathType Leaf)) {
  throw "The trial workspace service host is missing from the hydrated application."
}
$taskAction = New-ScheduledTaskAction `
  -Execute $nodePathValue `
  -Argument ('"{0}" --config "{1}"' -f $serviceScript, $configFile) `
  -WorkingDirectory $appRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

if ($task) {
  Set-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
} else {
  Register-ScheduledTask -TaskName $taskName -Action $taskAction -Trigger $trigger -Principal $principal -Settings $settings | Out-Null
}
Start-ScheduledTask -TaskName $taskName
