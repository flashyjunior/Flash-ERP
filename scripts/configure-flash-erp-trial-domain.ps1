[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9.-]+$')]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[^@\s]+@[^@\s]+\.[^@\s]+$')]
  [string]$AcmeEmail,

  [ValidateRange(1024, 65535)]
  [int]$UpstreamPort = 3102,

  [string]$ExpectedIPv4 = '84.247.188.30',

  [string]$InstallRoot = 'C:\FlashRMS\edge\caddy'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-ElevatedAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from an elevated PowerShell window.'
  }
}

function Get-ListeningProcessDetails([int[]]$Ports) {
  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $Ports -contains $_.LocalPort } |
    Sort-Object LocalPort, OwningProcess -Unique
  foreach ($listener in $listeners) {
    $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    [pscustomobject]@{
      Port = $listener.LocalPort
      Address = $listener.LocalAddress
      ProcessId = $listener.OwningProcess
      ProcessName = if ($process) { $process.ProcessName } else { 'unknown' }
      ProcessPath = if ($process) { $process.Path } else { $null }
    }
  }
}

Assert-ElevatedAdministrator
$Domain = $Domain.Trim().ToLowerInvariant()
$AcmeEmail = $AcmeEmail.Trim()
$upstreamBaseUrl = "http://127.0.0.1:$UpstreamPort"

$resolvedAddresses = @(
  Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop |
    Where-Object Type -eq 'A' |
    ForEach-Object IPAddress
)
if ($ExpectedIPv4 -and $resolvedAddresses -notcontains $ExpectedIPv4) {
  throw "$Domain does not resolve to the expected VPS address $ExpectedIPv4. Resolved: $($resolvedAddresses -join ', ')."
}

$liveResponse = Invoke-WebRequest -UseBasicParsing -Uri "$upstreamBaseUrl/api/system/live" -TimeoutSec 20
if ($liveResponse.StatusCode -ne 200) {
  throw "The trial runtime did not return HTTP 200 from $upstreamBaseUrl/api/system/live."
}

$serviceName = 'FlashERPEdge'
$existingEdgeService = Get-CimInstance Win32_Service -Filter "Name='$serviceName'" -ErrorAction SilentlyContinue
$existingEdgeProcessId = if ($existingEdgeService) { [int]$existingEdgeService.ProcessId } else { 0 }
$blockingListeners = @(
  Get-ListeningProcessDetails -Ports @(80, 443) |
    Where-Object { $existingEdgeProcessId -eq 0 -or $_.ProcessId -ne $existingEdgeProcessId }
)
if ($blockingListeners.Count -gt 0) {
  $summary = ($blockingListeners | ForEach-Object {
      "port $($_.Port) is owned by $($_.ProcessName) (PID $($_.ProcessId))"
    }) -join '; '
  throw "Caddy cannot safely take over HTTPS because $summary. On this VPS TSplus currently owns the public web ports. In TSplus AdminTool > Web > Web Server, move HTTP to 8080 and HTTPS to 8443, save/restart TSplus Web Servers, verify those ports, then rerun this script."
}

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null
$caddyPath = Join-Path $InstallRoot 'caddy.exe'
$caddyFilePath = Join-Path $InstallRoot 'Caddyfile'
$logDirectory = Join-Path $InstallRoot 'logs'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $caddyPath -PathType Leaf)) {
  $downloadPath = Join-Path $env:TEMP "caddy-$([Guid]::NewGuid().ToString('N')).exe"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://caddyserver.com/api/download?os=windows&arch=amd64' -OutFile $downloadPath
    Move-Item -LiteralPath $downloadPath -Destination $caddyPath -Force
  } finally {
    Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  }
}

$caddyFile = @"
{
  email $AcmeEmail
  acme_ca https://acme-v02.api.letsencrypt.org/directory
  admin 127.0.0.1:2019
}

$Domain {
  encode zstd gzip
  reverse_proxy 127.0.0.1:$UpstreamPort
  header {
    -Server
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
  }
  log {
    output file $($logDirectory.Replace('\', '/'))/access.log {
      roll_size 25MiB
      roll_keep 10
      roll_keep_for 720h
    }
  }
}
"@
Set-Content -LiteralPath $caddyFilePath -Value $caddyFile -Encoding Ascii

& $caddyPath validate --config $caddyFilePath --adapter caddyfile
if ($LASTEXITCODE -ne 0) {
  throw 'Caddy rejected the generated configuration.'
}

foreach ($rule in @(
    @{ Name = 'Flash ERP HTTPS'; Port = 443 },
    @{ Name = 'Flash ERP ACME HTTP'; Port = 80 }
  )) {
  if (-not (Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port | Out-Null
  }
}

$service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($service) {
  if ($service.Status -ne 'Stopped') {
    Stop-Service -Name $serviceName -Force
  }
  & sc.exe delete $serviceName | Out-Null
  Start-Sleep -Seconds 2
}
$binaryPath = '"{0}" run --config "{1}" --adapter caddyfile' -f $caddyPath, $caddyFilePath
& sc.exe create $serviceName start= auto DisplayName= 'Flash ERP HTTPS Edge' binPath= $binaryPath | Out-Null
& sc.exe description $serviceName 'Caddy reverse proxy with automatic Let''s Encrypt renewal for Flash ERP.' | Out-Null
& sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
Start-Service -Name $serviceName

$deadline = (Get-Date).AddMinutes(3)
do {
  Start-Sleep -Seconds 3
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "https://$Domain/api/system/live" -TimeoutSec 15
  } catch {
    $response = $null
  }
} until (($response -and $response.StatusCode -eq 200) -or (Get-Date) -ge $deadline)

if (-not $response -or $response.StatusCode -ne 200) {
  $status = Get-Service -Name $serviceName
  throw "Flash ERP HTTPS validation did not reach HTTP 200 before timeout. Service state: $($status.Status). Review $logDirectory and Windows Event Viewer."
}

$certificate = $null
$tcp = [Net.Sockets.TcpClient]::new($Domain, 443)
try {
  $ssl = [Net.Security.SslStream]::new($tcp.GetStream(), $false, { $true })
  try {
    $ssl.AuthenticateAsClient($Domain)
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new($ssl.RemoteCertificate)
  } finally {
    $ssl.Dispose()
  }
} finally {
  $tcp.Dispose()
}

[pscustomobject]@{
  Domain = $Domain
  Upstream = $upstreamBaseUrl
  Service = (Get-Service -Name $serviceName).Status
  CertificateSubject = $certificate.Subject
  CertificateIssuer = $certificate.Issuer
  CertificateExpires = $certificate.NotAfter
  AutomaticRenewal = 'Managed continuously by the FlashERPEdge Caddy service'
} | Format-List
