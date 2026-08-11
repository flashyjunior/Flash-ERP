<#
Backs up and clears Flash ERP HQ operational data while retaining master data.
Run from an elevated PowerShell session on the HQ host with -Execute.
#>

param(
  [string]$Root = "C:\FlashERP",
  [string]$DatabaseName = "Flash-ERP",
  [string]$TaskName = "FlashERPHQ",
  [int]$Port = 3000,
  [switch]$Execute
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ($DatabaseName -ne "Flash-ERP") {
  throw "This purge is locked to the Flash-ERP database."
}

if (-not $Execute) {
  throw "No data was changed. Pass -Execute to confirm the backup and transactional purge."
}

$timestamp = [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss")
$backupDirectory = Join-Path $Root "backups"
$reportDirectory = Join-Path $Root "purge-reports"
$backupPath = Join-Path $backupDirectory "Flash-ERP-before-transaction-purge-$timestamp.bak"
$reportPath = Join-Path $reportDirectory "transaction-purge-$timestamp.txt"
$taskExists = $null -ne (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)

New-Item -ItemType Directory -Force -Path $backupDirectory, $reportDirectory | Out-Null
& icacls.exe $backupDirectory /grant "NT SERVICE\MSSQLSERVER:(OI)(CI)(M)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Could not grant the SQL Server service access to the backup directory."
}

function New-SqlConnection {
  param([string]$InitialCatalog)

  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $builder["Data Source"] = "localhost"
  $builder["Initial Catalog"] = $InitialCatalog
  $builder["Integrated Security"] = $true
  $builder["TrustServerCertificate"] = $true
  $builder["Application Name"] = "Flash ERP transaction purge"
  return New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
}

function Invoke-SqlNonQuery {
  param(
    [System.Data.SqlClient.SqlConnection]$Connection,
    [string]$Sql
  )

  $command = $Connection.CreateCommand()
  $command.CommandTimeout = 0
  $command.CommandText = $Sql
  [void]$command.ExecuteNonQuery()
}

function Stop-HqRuntime {
  if ($taskExists) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  }

  Start-Sleep -Seconds 3
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

function Start-HqRuntime {
  if (-not $taskExists) {
    return
  }

  Start-ScheduledTask -TaskName $TaskName
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    Start-Sleep -Seconds 2
    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/system/live" -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -eq 200) {
        return
      }
    } catch {
      if ($attempt -eq 60) {
        throw
      }
    }
  }

  throw "Flash ERP HQ did not become healthy after the purge."
}

$purgeSql = @'
SET NOCOUNT ON;
SET XACT_ABORT ON;

IF DB_NAME() <> N'Flash-ERP'
  THROW 51000, 'The purge connected to the wrong database.', 1;

IF OBJECT_ID(N'dbo.RetailOrg', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Product', N'U') IS NULL
   OR OBJECT_ID(N'dbo.PosTransaction', N'U') IS NULL
  THROW 51001, 'The target is not a complete Flash ERP database.', 1;

CREATE TABLE #MasterBefore (
  tableName SYSNAME NOT NULL PRIMARY KEY,
  recordCount BIGINT NOT NULL
);

INSERT INTO #MasterBefore (tableName, recordCount)
SELECT N'RetailOrg', COUNT_BIG(*) FROM dbo.RetailOrg UNION ALL
SELECT N'Store', COUNT_BIG(*) FROM dbo.Store UNION ALL
SELECT N'Warehouse', COUNT_BIG(*) FROM dbo.Warehouse UNION ALL
SELECT N'Terminal', COUNT_BIG(*) FROM dbo.Terminal UNION ALL
SELECT N'SyncNode', COUNT_BIG(*) FROM dbo.SyncNode UNION ALL
SELECT N'RetailUser', COUNT_BIG(*) FROM dbo.RetailUser UNION ALL
SELECT N'Role', COUNT_BIG(*) FROM dbo.Role UNION ALL
SELECT N'Permission', COUNT_BIG(*) FROM dbo.Permission UNION ALL
SELECT N'Customer', COUNT_BIG(*) FROM dbo.Customer UNION ALL
SELECT N'Supplier', COUNT_BIG(*) FROM dbo.Supplier UNION ALL
SELECT N'TaxProfile', COUNT_BIG(*) FROM dbo.TaxProfile UNION ALL
SELECT N'TenderMethod', COUNT_BIG(*) FROM dbo.TenderMethod UNION ALL
SELECT N'PromotionCampaign', COUNT_BIG(*) FROM dbo.PromotionCampaign UNION ALL
SELECT N'Product', COUNT_BIG(*) FROM dbo.Product UNION ALL
SELECT N'Barcode', COUNT_BIG(*) FROM dbo.Barcode UNION ALL
SELECT N'PriceList', COUNT_BIG(*) FROM dbo.PriceList UNION ALL
SELECT N'PriceListEntry', COUNT_BIG(*) FROM dbo.PriceListEntry UNION ALL
SELECT N'StoreProductPrice', COUNT_BIG(*) FROM dbo.StoreProductPrice UNION ALL
SELECT N'InventoryLocation', COUNT_BIG(*) FROM dbo.InventoryLocation UNION ALL
SELECT N'Bank', COUNT_BIG(*) FROM dbo.Bank UNION ALL
SELECT N'BankBranch', COUNT_BIG(*) FROM dbo.BankBranch UNION ALL
SELECT N'BankAccount', COUNT_BIG(*) FROM dbo.BankAccount UNION ALL
SELECT N'ReceiptTemplate', COUNT_BIG(*) FROM dbo.ReceiptTemplate UNION ALL
SELECT N'GlAccount', COUNT_BIG(*) FROM dbo.GlAccount;

CREATE TABLE #DeletedCounts (
  tableName SYSNAME NOT NULL PRIMARY KEY,
  deletedRows BIGINT NOT NULL
);

BEGIN TRY
  BEGIN TRANSACTION;

  DELETE FROM dbo.SyncOperatorAction;
  INSERT INTO #DeletedCounts VALUES (N'SyncOperatorAction', @@ROWCOUNT);
  DELETE FROM dbo.SyncOutboxEvent;
  INSERT INTO #DeletedCounts VALUES (N'SyncOutboxEvent', @@ROWCOUNT);
  DELETE FROM dbo.SyncInboundEvent;
  INSERT INTO #DeletedCounts VALUES (N'SyncInboundEvent', @@ROWCOUNT);
  DELETE FROM dbo.SyncInboxCheckpoint;
  INSERT INTO #DeletedCounts VALUES (N'SyncInboxCheckpoint', @@ROWCOUNT);
  DELETE FROM dbo.SecurityLog;
  INSERT INTO #DeletedCounts VALUES (N'SecurityLog', @@ROWCOUNT);
  DELETE FROM dbo.RetailUserSession;
  INSERT INTO #DeletedCounts VALUES (N'RetailUserSession', @@ROWCOUNT);
  DELETE FROM dbo.LicenseEvent;
  INSERT INTO #DeletedCounts VALUES (N'LicenseEvent', @@ROWCOUNT);

  DELETE FROM dbo.BankingDeposit;
  INSERT INTO #DeletedCounts VALUES (N'BankingDeposit', @@ROWCOUNT);
  DELETE FROM dbo.EodReconciliation;
  INSERT INTO #DeletedCounts VALUES (N'EodReconciliation', @@ROWCOUNT);
  DELETE FROM dbo.CustomerAccountEntry;
  INSERT INTO #DeletedCounts VALUES (N'CustomerAccountEntry', @@ROWCOUNT);
  DELETE FROM dbo.PosPayment;
  INSERT INTO #DeletedCounts VALUES (N'PosPayment', @@ROWCOUNT);
  DELETE FROM dbo.SalesOrderLine;
  INSERT INTO #DeletedCounts VALUES (N'SalesOrderLine', @@ROWCOUNT);
  DELETE FROM dbo.SalesOrder;
  INSERT INTO #DeletedCounts VALUES (N'SalesOrder', @@ROWCOUNT);
  DELETE FROM dbo.PosTransactionLine;
  INSERT INTO #DeletedCounts VALUES (N'PosTransactionLine', @@ROWCOUNT);
  DELETE FROM dbo.PosTransaction;
  INSERT INTO #DeletedCounts VALUES (N'PosTransaction', @@ROWCOUNT);
  DELETE FROM dbo.PosShift;
  INSERT INTO #DeletedCounts VALUES (N'PosShift', @@ROWCOUNT);
  DELETE FROM dbo.transaction_reference_capture;
  INSERT INTO #DeletedCounts VALUES (N'transaction_reference_capture', @@ROWCOUNT);

  DELETE FROM dbo.InventoryLedgerEntry;
  INSERT INTO #DeletedCounts VALUES (N'InventoryLedgerEntry', @@ROWCOUNT);
  DELETE FROM dbo.InventorySerialUnit;
  INSERT INTO #DeletedCounts VALUES (N'InventorySerialUnit', @@ROWCOUNT);
  DELETE FROM dbo.InventoryBatch;
  INSERT INTO #DeletedCounts VALUES (N'InventoryBatch', @@ROWCOUNT);
  DELETE FROM dbo.SupplierReturnLine;
  INSERT INTO #DeletedCounts VALUES (N'SupplierReturnLine', @@ROWCOUNT);
  DELETE FROM dbo.SupplierReturn;
  INSERT INTO #DeletedCounts VALUES (N'SupplierReturn', @@ROWCOUNT);
  DELETE FROM dbo.SupplierClaimLine;
  INSERT INTO #DeletedCounts VALUES (N'SupplierClaimLine', @@ROWCOUNT);
  DELETE FROM dbo.SupplierClaim;
  INSERT INTO #DeletedCounts VALUES (N'SupplierClaim', @@ROWCOUNT);
  DELETE FROM dbo.GoodsReceiptLine;
  INSERT INTO #DeletedCounts VALUES (N'GoodsReceiptLine', @@ROWCOUNT);
  DELETE FROM dbo.GoodsReceipt;
  INSERT INTO #DeletedCounts VALUES (N'GoodsReceipt', @@ROWCOUNT);
  DELETE FROM dbo.PurchaseOrderLine;
  INSERT INTO #DeletedCounts VALUES (N'PurchaseOrderLine', @@ROWCOUNT);
  DELETE FROM dbo.PurchaseOrder;
  INSERT INTO #DeletedCounts VALUES (N'PurchaseOrder', @@ROWCOUNT);
  DELETE FROM dbo.InterStoreTransfer;
  INSERT INTO #DeletedCounts VALUES (N'InterStoreTransfer', @@ROWCOUNT);
  DELETE FROM dbo.StockCountSession;
  INSERT INTO #DeletedCounts VALUES (N'StockCountSession', @@ROWCOUNT);

  DELETE FROM dbo.GlJournalLine;
  INSERT INTO #DeletedCounts VALUES (N'GlJournalLine', @@ROWCOUNT);
  DELETE FROM dbo.GlJournalEntry;
  INSERT INTO #DeletedCounts VALUES (N'GlJournalEntry', @@ROWCOUNT);
  DELETE FROM dbo.OperatingExpense;
  INSERT INTO #DeletedCounts VALUES (N'OperatingExpense', @@ROWCOUNT);
  DELETE FROM dbo.GiftCertificate;
  INSERT INTO #DeletedCounts VALUES (N'GiftCertificate', @@ROWCOUNT);

  UPDATE dbo.Customer
  SET receivableBalanceAmount = 0,
      loyaltyPointsBalance = 0,
      updatedAt = SYSUTCDATETIME();

  UPDATE dbo.ProductMatrixVariant
  SET quantityOnHand = 0,
      updatedAt = SYSUTCDATETIME();

  UPDATE dbo.RetailUser
  SET failedLoginAttempts = 0,
      lockedUntil = NULL,
      lastLoginAt = NULL,
      updatedAt = SYSUTCDATETIME();

  UPDATE dbo.Terminal
  SET lastHeartbeatAt = NULL,
      updatedAt = SYSUTCDATETIME();

  UPDATE dbo.SyncNode
  SET lastHeartbeatAt = NULL,
      lastTelemetryAt = NULL,
      lastReportedHealth = NULL,
      lastReportedUpstreamQueued = NULL,
      lastReportedUpstreamInFlight = NULL,
      lastReportedDownstreamQueued = NULL,
      lastReportedDeadLetter = NULL,
      lastReportedLastSyncAt = NULL,
      lastReportedLastLocalWriteAt = NULL,
      nextScheduledSyncAt = NULL,
      lastManualSyncAt = NULL,
      lastAutoSyncAt = NULL,
      updatedAt = SYSUTCDATETIME();

  CREATE TABLE #MasterAfter (
    tableName SYSNAME NOT NULL PRIMARY KEY,
    recordCount BIGINT NOT NULL
  );

  INSERT INTO #MasterAfter (tableName, recordCount)
  SELECT N'RetailOrg', COUNT_BIG(*) FROM dbo.RetailOrg UNION ALL
  SELECT N'Store', COUNT_BIG(*) FROM dbo.Store UNION ALL
  SELECT N'Warehouse', COUNT_BIG(*) FROM dbo.Warehouse UNION ALL
  SELECT N'Terminal', COUNT_BIG(*) FROM dbo.Terminal UNION ALL
  SELECT N'SyncNode', COUNT_BIG(*) FROM dbo.SyncNode UNION ALL
  SELECT N'RetailUser', COUNT_BIG(*) FROM dbo.RetailUser UNION ALL
  SELECT N'Role', COUNT_BIG(*) FROM dbo.Role UNION ALL
  SELECT N'Permission', COUNT_BIG(*) FROM dbo.Permission UNION ALL
  SELECT N'Customer', COUNT_BIG(*) FROM dbo.Customer UNION ALL
  SELECT N'Supplier', COUNT_BIG(*) FROM dbo.Supplier UNION ALL
  SELECT N'TaxProfile', COUNT_BIG(*) FROM dbo.TaxProfile UNION ALL
  SELECT N'TenderMethod', COUNT_BIG(*) FROM dbo.TenderMethod UNION ALL
  SELECT N'PromotionCampaign', COUNT_BIG(*) FROM dbo.PromotionCampaign UNION ALL
  SELECT N'Product', COUNT_BIG(*) FROM dbo.Product UNION ALL
  SELECT N'Barcode', COUNT_BIG(*) FROM dbo.Barcode UNION ALL
  SELECT N'PriceList', COUNT_BIG(*) FROM dbo.PriceList UNION ALL
  SELECT N'PriceListEntry', COUNT_BIG(*) FROM dbo.PriceListEntry UNION ALL
  SELECT N'StoreProductPrice', COUNT_BIG(*) FROM dbo.StoreProductPrice UNION ALL
  SELECT N'InventoryLocation', COUNT_BIG(*) FROM dbo.InventoryLocation UNION ALL
  SELECT N'Bank', COUNT_BIG(*) FROM dbo.Bank UNION ALL
  SELECT N'BankBranch', COUNT_BIG(*) FROM dbo.BankBranch UNION ALL
  SELECT N'BankAccount', COUNT_BIG(*) FROM dbo.BankAccount UNION ALL
  SELECT N'ReceiptTemplate', COUNT_BIG(*) FROM dbo.ReceiptTemplate UNION ALL
  SELECT N'GlAccount', COUNT_BIG(*) FROM dbo.GlAccount;

  IF EXISTS (
    SELECT 1
    FROM #MasterBefore AS beforeRows
    INNER JOIN #MasterAfter AS afterRows
      ON afterRows.tableName = beforeRows.tableName
    WHERE beforeRows.recordCount <> afterRows.recordCount
  )
  BEGIN
    THROW 51002, 'A protected master-data table count changed during the purge.', 1;
  END;

  IF (
    (SELECT COUNT_BIG(*) FROM dbo.PosTransaction) +
    (SELECT COUNT_BIG(*) FROM dbo.PosTransactionLine) +
    (SELECT COUNT_BIG(*) FROM dbo.PosPayment) +
    (SELECT COUNT_BIG(*) FROM dbo.SalesOrder) +
    (SELECT COUNT_BIG(*) FROM dbo.SalesOrderLine) +
    (SELECT COUNT_BIG(*) FROM dbo.InventoryLedgerEntry) +
    (SELECT COUNT_BIG(*) FROM dbo.InventorySerialUnit) +
    (SELECT COUNT_BIG(*) FROM dbo.InventoryBatch) +
    (SELECT COUNT_BIG(*) FROM dbo.PurchaseOrder) +
    (SELECT COUNT_BIG(*) FROM dbo.GoodsReceipt) +
    (SELECT COUNT_BIG(*) FROM dbo.GlJournalEntry) +
    (SELECT COUNT_BIG(*) FROM dbo.SyncOutboxEvent) +
    (SELECT COUNT_BIG(*) FROM dbo.SyncInboundEvent)
  ) <> 0
  BEGIN
    THROW 51003, 'One or more transactional tables still contain rows.', 1;
  END;

  COMMIT TRANSACTION;
END TRY
BEGIN CATCH
  IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
  THROW;
END CATCH;

SELECT tableName, deletedRows
FROM #DeletedCounts
ORDER BY tableName;

SELECT beforeRows.tableName,
       beforeRows.recordCount AS beforeCount,
       afterRows.recordCount AS afterCount
FROM #MasterBefore AS beforeRows
INNER JOIN #MasterAfter AS afterRows
  ON afterRows.tableName = beforeRows.tableName
ORDER BY beforeRows.tableName;
'@

$taskStopped = $false
try {
  Stop-HqRuntime
  $taskStopped = $true

  $validationConnection = New-SqlConnection -InitialCatalog $DatabaseName
  $validationConnection.Open()
  try {
    Invoke-SqlNonQuery -Connection $validationConnection -Sql "SET PARSEONLY ON;`n$purgeSql`nSET PARSEONLY OFF;"
  } finally {
    $validationConnection.Close()
  }

  $escapedBackupPath = $backupPath.Replace("'", "''")
  $masterConnection = New-SqlConnection -InitialCatalog "master"
  $masterConnection.Open()
  try {
    Invoke-SqlNonQuery -Connection $masterConnection -Sql @"
BACKUP DATABASE [$DatabaseName]
TO DISK = N'$escapedBackupPath'
WITH COPY_ONLY, CHECKSUM, INIT, STATS = 10;

RESTORE VERIFYONLY
FROM DISK = N'$escapedBackupPath'
WITH CHECKSUM;
"@
  } finally {
    $masterConnection.Close()
  }

  $databaseConnection = New-SqlConnection -InitialCatalog $DatabaseName
  $databaseConnection.Open()
  try {
    $command = $databaseConnection.CreateCommand()
    $command.CommandTimeout = 0
    $command.CommandText = $purgeSql
    $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($command)
    $result = New-Object System.Data.DataSet
    [void]$adapter.Fill($result)
  } finally {
    $databaseConnection.Close()
  }

  $backupHash = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
  $deletedRows = $result.Tables[0] | ForEach-Object {
    "$($_.tableName)=$($_.deletedRows)"
  }
  $masterRows = $result.Tables[1] | ForEach-Object {
    "$($_.tableName):$($_.beforeCount)->$($_.afterCount)"
  }

  @(
    "Flash ERP VPS transaction purge"
    "Status=COMPLETE"
    "CompletedUtc=$([DateTime]::UtcNow.ToString('o'))"
    "Database=$DatabaseName"
    "BackupPath=$backupPath"
    "BackupSHA256=$backupHash"
    "DeletedRows"
    $deletedRows
    "ProtectedMasterCounts"
    $masterRows
  ) | Set-Content -LiteralPath $reportPath -Encoding UTF8
} finally {
  if ($taskStopped) {
    Start-HqRuntime
  }
}

$readiness = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/system/database-readiness" -UseBasicParsing -TimeoutSec 15
if ($readiness.StatusCode -ne 200 -or -not (($readiness.Content | ConvertFrom-Json).ready)) {
  throw "Database readiness failed after the transaction purge."
}

Write-Host "Flash ERP transactional data purge completed successfully." -ForegroundColor Green
Write-Host "Backup: $backupPath"
Write-Host "Report: $reportPath"
