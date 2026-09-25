All commands below are run **directly on the VPS**. No file copying is required.

**1. Update And Build**
Open **PowerShell as Administrator**:

```powershell
Set-Location "C:\Users\Demo\Documents\FlashERP\Flash-ERP"

git switch master
git fetch origin
git pull --ff-only origin master

git log --oneline -1
git status -sb
```

Confirm the latest commit is `f32ab61`. If `git status` shows modified tracked files, stop and review them before continuing.

```powershell
npm ci

npm run acceptance:trial-lifecycle
npm run acceptance:enterprise-authorization
npm run build:deploy
```

Do not run `npm audit fix --force`.

**2. Package On The VPS**
Use a unique release ID:

```powershell
$Commit = (git rev-parse --short HEAD).Trim()
$ReleaseId = "$Commit-r$(Get-Date -Format 'yyyyMMddHHmmss')"

powershell -NoProfile -ExecutionPolicy Bypass `
    -File .\scripts\package-flash-erp-vps-release.ps1 `
    -ReleaseId $ReleaseId `
    -StoreCode "accra-shop" `
    -PublicBaseUrl "http://84.247.188.30:3000"

if ($LASTEXITCODE -ne 0) {
    throw "Release packaging failed."
}
```

**3. Verify And Deploy**
Continue in the same PowerShell window:

```powershell
$PackageName = "FlashERP-HQ-$($ReleaseId.ToUpperInvariant())-VPS-Deploy-Resolved"
$Zip = Join-Path $PWD "artifacts\releases\$PackageName.zip"
$HashFile = "$Zip.sha256.txt"
$OperatorDirectory = "C:\Users\Demo\Desktop\$PackageName"

$ExpectedHash = ((Get-Content $HashFile -Raw).Trim() -split '\s+')[0]
$ActualHash = (Get-FileHash -LiteralPath $Zip -Algorithm SHA256).Hash

if ($ExpectedHash -ne $ActualHash) {
    throw "Release package checksum mismatch."
}

if (Test-Path $OperatorDirectory) {
    throw "Operator directory already exists. Use a new release ID."
}

Expand-Archive -LiteralPath $Zip -DestinationPath $OperatorDirectory
Set-Location $OperatorDirectory

& ".\Deploy Flash ERP $ReleaseId.cmd"

if ($LASTEXITCODE -ne 0) {
    throw "Deployment failed. Do not reuse release ID $ReleaseId."
}
```

This deployment updates HQ and automatically makes the trial provisioner:

- Apply the new migration to Majeed’s database.
- Refresh Majeed from the new release.
- Restart Majeed on port `3102`.
- Preserve the Caddy domain and certificate.

Do not rerun the domain configuration scripts.

**4. Verify HQ And Majeed**
```powershell
Get-ScheduledTask -TaskName `
    "FlashRMSHQ",
    "FlashERPTrial-s-majeed-phones-6398dfce" |
    Select-Object TaskName, State

Get-NetTCPConnection -State Listen |
    Where-Object LocalPort -in 3000,3099,3102 |
    Select-Object LocalAddress, LocalPort, OwningProcess

Invoke-RestMethod "http://127.0.0.1:3099/health" |
    ConvertTo-Json -Depth 6
```

The provisioner must show `reconciliation.status: succeeded`.

```powershell
$Migration = "20260922050000_flash_support_full_access"

$Hq = Invoke-RestMethod "http://84.247.188.30:3000/api/system/database-readiness"
$Majeed = Invoke-RestMethod "https://majeed.flashcodesolutions.com.gh/api/system/database-readiness"

[pscustomobject]@{
    System = "HQ"
    Ready = $Hq.ready
    MigrationPresent = (($Hq | ConvertTo-Json -Depth 20).Contains($Migration))
}

[pscustomobject]@{
    System = "Majeed"
    Ready = $Majeed.ready
    MigrationPresent = (($Majeed | ConvertTo-Json -Depth 20).Contains($Migration))
}
```

Both must return `Ready = True` and `MigrationPresent = True`. Then sign out and sign back into the Majeed Flash Support account.