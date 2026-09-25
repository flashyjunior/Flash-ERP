<#
Generates a guarded SQL Server stock-balance import from stocks.xlsx.

The workbook is read only. Rows with the placeholder location, zero quantities,
or negative quantities are excluded. The generated SQL uses inventory-ledger
deltas so rerunning it does not duplicate stock.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [string]$OutputPath = "",

  [string]$DatabaseName = "flash_erp_trial_s_majeed_phones_6398dfce"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $PSScriptRoot "..\artifacts\sql\update-vps-trial-stock-from-stocks-workbook.sql"
}

$expectedWorkbookSha256 = "5BEB199C6ECEA6FFC7E81E73D09219A56CB6BB2770CCC4F6ADAA64B1E5C99600"
$expectedPositiveRows = 272
$expectedPositiveQuantity = [decimal]8786
$expectedNegativeRows = 18
$expectedPlaceholderRows = 217
$locationMap = [ordered]@{
  "Main Location" = [ordered]@{ StoreCode = "MAIN"; LocationCode = "MAIN-SALES" }
  "Abdul Rauf" = [ordered]@{ StoreCode = "ABDUL-RAUF"; LocationCode = "ABDUL-RAUF-SALES" }
  "Screens & Accessories" = [ordered]@{ StoreCode = "SCREENS-ACCESSORIES"; LocationCode = "SCREENS-ACCESSORIES-SALES" }
  "SHOP B" = [ordered]@{ StoreCode = "SHOP-B"; LocationCode = "SHOP-B-SALES" }
}

function Get-SharedFileSha256 {
  param([string]$Path)

  $stream = [IO.File]::Open(
    $Path,
    [IO.FileMode]::Open,
    [IO.FileAccess]::Read,
    [IO.FileShare]::ReadWrite
  )
  try {
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace("-", "")
    }
    finally {
      $sha.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

function ConvertTo-SqlUnicodeLiteral {
  param([AllowEmptyString()][string]$Value)
  return "N'" + $Value.Replace("'", "''") + "'"
}

$resolvedWorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$resolvedOutputPath = [IO.Path]::GetFullPath($OutputPath)
$workbookSha256 = Get-SharedFileSha256 -Path $resolvedWorkbookPath
if ($workbookSha256 -cne $expectedWorkbookSha256) {
  throw "Workbook SHA-256 $workbookSha256 does not match the approved stocks.xlsx fingerprint."
}

$excel = $null
$workbook = $null
$worksheet = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($resolvedWorkbookPath, 0, $true)
  $worksheet = $workbook.Worksheets.Item("STOCK BY LOCATION")
  $values = $worksheet.UsedRange.Value2

  $headers = @{}
  for ($column = 1; $column -le $values.GetLength(1); $column++) {
    $header = [string]$values[5, $column]
    if ($header) {
      $headers[$header.Trim()] = $column
    }
  }

  foreach ($requiredHeader in @("Product code", "Location", "Closing Quantity")) {
    if (-not $headers.ContainsKey($requiredHeader)) {
      throw "STOCK BY LOCATION is missing the required '$requiredHeader' column."
    }
  }

  $sourceRows = @()
  for ($row = 6; $row -le $values.GetLength(0); $row++) {
    $productCode = ([string]$values[$row, $headers["Product code"]]).Trim()
    if (-not $productCode) {
      continue
    }

    $location = ([string]$values[$row, $headers["Location"]]).Trim()
    $rawQuantity = $values[$row, $headers["Closing Quantity"]]
    $quantity = if ($null -eq $rawQuantity -or ([string]$rawQuantity).Trim() -eq "") {
      [decimal]0
    }
    else {
      [decimal]$rawQuantity
    }

    $sourceRows += [pscustomobject]@{
      SourceRow = $row
      ProductCode = $productCode
      Location = $location
      Quantity = $quantity
    }
  }
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($worksheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($worksheet) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$knownLocations = @($locationMap.Keys) + @("No Closing Stock")
$unexpectedLocations = @(
  $sourceRows.Location |
    Sort-Object -Unique |
    Where-Object { $_ -notin $knownLocations }
)
if ($unexpectedLocations.Count -gt 0) {
  throw "Unexpected workbook location(s): $($unexpectedLocations -join ', ')."
}

$negativeRows = @($sourceRows | Where-Object Quantity -lt 0)
$placeholderRows = @($sourceRows | Where-Object Location -eq "No Closing Stock")
$positiveRows = @(
  $sourceRows |
    Where-Object { $_.Quantity -gt 0 -and $locationMap.Contains($_.Location) } |
    Sort-Object Location, ProductCode
)
$positiveQuantity = [decimal](($positiveRows | Measure-Object Quantity -Sum).Sum)

if ($negativeRows.Count -ne $expectedNegativeRows) {
  throw "Expected $expectedNegativeRows negative rows to be excluded, found $($negativeRows.Count)."
}
if ($placeholderRows.Count -ne $expectedPlaceholderRows) {
  throw "Expected $expectedPlaceholderRows placeholder rows to be excluded, found $($placeholderRows.Count)."
}
if ($positiveRows.Count -ne $expectedPositiveRows -or $positiveQuantity -ne $expectedPositiveQuantity) {
  throw "Expected $expectedPositiveRows positive rows totaling $expectedPositiveQuantity, found $($positiveRows.Count) totaling $positiveQuantity."
}

$duplicates = @(
  $positiveRows |
    Group-Object ProductCode, Location |
    Where-Object Count -gt 1
)
if ($duplicates.Count -gt 0) {
  throw "Duplicate positive product/location rows were found: $($duplicates.Name -join ', ')."
}

$valueLines = foreach ($row in $positiveRows) {
  $mapping = $locationMap[$row.Location]
  $sourceRow = [int]$row.SourceRow
  $productCode = ConvertTo-SqlUnicodeLiteral -Value $row.ProductCode
  $storeCode = ConvertTo-SqlUnicodeLiteral -Value $mapping.StoreCode
  $locationCode = ConvertTo-SqlUnicodeLiteral -Value $mapping.LocationCode
  $quantity = ([decimal]$row.Quantity).ToString("0.000", [Globalization.CultureInfo]::InvariantCulture)
  "  ($sourceRow, $productCode, $storeCode, $locationCode, $quantity)"
}
$valuesSql = $valueLines -join ",`r`n"
$escapedDatabaseName = ConvertTo-SqlUnicodeLiteral -Value $DatabaseName

$sql = @"
/*
  Flash ERP VPS stock import generated from the STOCK BY LOCATION sheet in stocks.xlsx.

  Target database: $DatabaseName
  Source worksheet: STOCK BY LOCATION
  Workbook SHA-256: $workbookSha256
  Included: $($positiveRows.Count) positive product/location balances, $positiveQuantity units.
  Excluded: $($negativeRows.Count) negative rows, $($placeholderRows.Count) No Closing Stock rows.

  Safety:
  - Preview is the default. Review the result sets first.
  - Set @ApplyChanges to 1 only when the preview is correct.
  - The script refuses to run against any other database.
  - Quantities are brought to workbook targets through ledger deltas, so reruns do not double stock.
  - Workbook products are changed to non-serialized/non-expiry only when no serial or batch records exist.
*/

USE [$($DatabaseName.Replace(']', ']]'))];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ApplyChanges bit = 0; -- Change to 1 only after reviewing preview output.
DECLARE @ExpectedDatabase sysname = $escapedDatabaseName;
DECLARE @WorkbookSha256 varchar(64) = '$workbookSha256';
DECLARE @BatchId nvarchar(200) = N'STOCKS-XLSX-20260920-POSITIVE-ONLY';
DECLARE @StockAsOf datetime2(3) = '2026-09-20T23:59:59.000';
DECLARE @RetailOrgId nvarchar(1000);

IF DB_NAME() <> @ExpectedDatabase
  THROW 51000, 'Wrong database. This script is locked to flash_erp_trial_s_majeed_phones_6398dfce.', 1;

IF OBJECT_ID(N'dbo.RetailOrg', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Store', N'U') IS NULL
   OR OBJECT_ID(N'dbo.InventoryLocation', N'U') IS NULL
   OR OBJECT_ID(N'dbo.Product', N'U') IS NULL
   OR OBJECT_ID(N'dbo.InventoryLedgerEntry', N'U') IS NULL
   OR OBJECT_ID(N'dbo.InventorySerialUnit', N'U') IS NULL
   OR OBJECT_ID(N'dbo.InventoryBatch', N'U') IS NULL
   OR OBJECT_ID(N'dbo.SecurityLog', N'U') IS NULL
  THROW 51001, 'Required Flash ERP inventory tables are missing.', 1;

IF OBJECT_ID(N'tempdb..#Adjustment', N'U') IS NOT NULL DROP TABLE #Adjustment;
IF OBJECT_ID(N'tempdb..#TrackingNormalization', N'U') IS NOT NULL DROP TABLE #TrackingNormalization;
IF OBJECT_ID(N'tempdb..#SourceStock', N'U') IS NOT NULL DROP TABLE #SourceStock;

CREATE TABLE #SourceStock (
  sourceRow int NOT NULL PRIMARY KEY,
  productCode nvarchar(1000) NOT NULL,
  storeCode nvarchar(1000) NOT NULL,
  locationCode nvarchar(1000) NOT NULL,
  targetQuantity decimal(18, 3) NOT NULL
);

INSERT INTO #SourceStock (sourceRow, productCode, storeCode, locationCode, targetQuantity)
VALUES
$valuesSql;

IF (SELECT COUNT(*) FROM #SourceStock) <> $($positiveRows.Count)
  THROW 51002, 'The embedded workbook row count is not the expected $($positiveRows.Count).', 1;

IF (SELECT COALESCE(SUM(targetQuantity), 0) FROM #SourceStock) <> CAST($positiveQuantity AS decimal(18, 3))
  THROW 51003, 'The embedded workbook quantity total is not the expected $positiveQuantity.', 1;

IF EXISTS (SELECT 1 FROM #SourceStock WHERE targetQuantity <= 0)
  THROW 51004, 'The source contains a zero or negative quantity; only positive balances are allowed.', 1;

IF EXISTS (
  SELECT 1
  FROM #SourceStock
  GROUP BY productCode, locationCode
  HAVING COUNT(*) > 1
)
  THROW 51010, 'The source contains duplicate product/location rows.', 1;

DECLARE @MatchingOrgCount int = (
  SELECT COUNT(*)
  FROM (
    SELECT s.retailOrgId
    FROM dbo.Store AS s
    WHERE s.code IN (N'MAIN', N'ABDUL-RAUF', N'SCREENS-ACCESSORIES', N'SHOP-B')
    GROUP BY s.retailOrgId
    HAVING COUNT(DISTINCT s.code) = 4
  ) AS matchingOrg
);

IF @MatchingOrgCount <> 1
  THROW 51005, 'Could not resolve exactly one organisation containing the four approved stores.', 1;

SELECT @RetailOrgId = matchingOrg.retailOrgId
FROM (
  SELECT s.retailOrgId
  FROM dbo.Store AS s
  WHERE s.code IN (N'MAIN', N'ABDUL-RAUF', N'SCREENS-ACCESSORIES', N'SHOP-B')
  GROUP BY s.retailOrgId
  HAVING COUNT(DISTINCT s.code) = 4
) AS matchingOrg;

IF EXISTS (
  SELECT 1
  FROM (VALUES
    (N'MAIN', N'MAIN-SALES'),
    (N'ABDUL-RAUF', N'ABDUL-RAUF-SALES'),
    (N'SCREENS-ACCESSORIES', N'SCREENS-ACCESSORIES-SALES'),
    (N'SHOP-B', N'SHOP-B-SALES')
  ) AS expected(storeCode, locationCode)
  LEFT JOIN dbo.Store AS s
    ON s.retailOrgId = @RetailOrgId
   AND s.code = expected.storeCode
   AND s.status = N'ACTIVE'
  LEFT JOIN dbo.InventoryLocation AS il
    ON il.retailOrgId = @RetailOrgId
   AND il.storeId = s.id
   AND il.code = expected.locationCode
   AND il.status = N'ACTIVE'
  WHERE s.id IS NULL OR il.id IS NULL
)
  THROW 51006, 'One or more approved active store/location mappings are missing.', 1;

IF EXISTS (
  SELECT 1
  FROM #SourceStock AS src
  LEFT JOIN dbo.Product AS p
    ON p.retailOrgId = @RetailOrgId
   AND p.code = src.productCode
  WHERE p.id IS NULL
)
BEGIN
  SELECT src.sourceRow, src.productCode, src.storeCode, src.locationCode
  FROM #SourceStock AS src
  LEFT JOIN dbo.Product AS p
    ON p.retailOrgId = @RetailOrgId
   AND p.code = src.productCode
  WHERE p.id IS NULL
  ORDER BY src.sourceRow;
  THROW 51007, 'One or more workbook product codes do not exist in the target organisation.', 1;
END;

IF EXISTS (
  SELECT 1
  FROM #SourceStock AS src
  JOIN dbo.Product AS p
    ON p.retailOrgId = @RetailOrgId
   AND p.code = src.productCode
  WHERE p.status <> N'ACTIVE'
     OR p.trackInventory <> 1
)
BEGIN
  SELECT
    src.sourceRow,
    src.productCode,
    p.status,
    p.trackInventory,
    p.isSerialized,
    p.trackExpiry
  FROM #SourceStock AS src
  JOIN dbo.Product AS p
    ON p.retailOrgId = @RetailOrgId
   AND p.code = src.productCode
  WHERE p.status <> N'ACTIVE'
     OR p.trackInventory <> 1
  ORDER BY src.sourceRow;
  THROW 51008, 'A target product is inactive or does not track inventory.', 1;
END;

SELECT DISTINCT
  p.id AS productId,
  p.code AS productCode,
  p.name AS productName,
  p.isSerialized,
  p.trackExpiry
INTO #TrackingNormalization
FROM #SourceStock AS src
JOIN dbo.Product AS p
  ON p.retailOrgId = @RetailOrgId
 AND p.code = src.productCode
WHERE p.isSerialized = 1 OR p.trackExpiry = 1;

IF EXISTS (
  SELECT 1
  FROM #TrackingNormalization AS tracked
  WHERE EXISTS (
      SELECT 1
      FROM dbo.InventorySerialUnit AS serial
      WHERE serial.retailOrgId = @RetailOrgId
        AND serial.productId = tracked.productId
    )
     OR EXISTS (
      SELECT 1
      FROM dbo.InventoryBatch AS batch
      WHERE batch.retailOrgId = @RetailOrgId
        AND batch.productId = tracked.productId
    )
)
BEGIN
  SELECT
    tracked.productCode,
    tracked.productName,
    tracked.isSerialized,
    tracked.trackExpiry,
    (
      SELECT COUNT(*)
      FROM dbo.InventorySerialUnit AS serial
      WHERE serial.retailOrgId = @RetailOrgId
        AND serial.productId = tracked.productId
    ) AS serialRecords,
    (
      SELECT COUNT(*)
      FROM dbo.InventoryBatch AS batch
      WHERE batch.retailOrgId = @RetailOrgId
        AND batch.productId = tracked.productId
    ) AS batchRecords
  FROM #TrackingNormalization AS tracked
  WHERE EXISTS (
      SELECT 1
      FROM dbo.InventorySerialUnit AS serial
      WHERE serial.retailOrgId = @RetailOrgId
        AND serial.productId = tracked.productId
    )
     OR EXISTS (
      SELECT 1
      FROM dbo.InventoryBatch AS batch
      WHERE batch.retailOrgId = @RetailOrgId
        AND batch.productId = tracked.productId
    )
  ORDER BY tracked.productCode;

  THROW 51011, 'Tracked products already have serial or batch records; no tracking flags or stock were changed.', 1;
END;

SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRANSACTION;

BEGIN TRY
  SELECT
    src.sourceRow,
    src.productCode,
    p.name AS productName,
    src.storeCode,
    src.locationCode,
    s.id AS storeId,
    il.id AS inventoryLocationId,
    il.warehouseId,
    p.id AS productId,
    p.baseCostPrice AS unitCost,
    CAST(COALESCE(SUM(ledger.quantity), 0) AS decimal(18, 3)) AS currentQuantity,
    src.targetQuantity,
    CAST(src.targetQuantity - COALESCE(SUM(ledger.quantity), 0) AS decimal(18, 3)) AS deltaQuantity
  INTO #Adjustment
  FROM #SourceStock AS src
  JOIN dbo.Store AS s
    ON s.retailOrgId = @RetailOrgId
   AND s.code = src.storeCode
  JOIN dbo.InventoryLocation AS il
    ON il.retailOrgId = @RetailOrgId
   AND il.storeId = s.id
   AND il.code = src.locationCode
  JOIN dbo.Product AS p
    ON p.retailOrgId = @RetailOrgId
   AND p.code = src.productCode
  LEFT JOIN dbo.InventoryLedgerEntry AS ledger WITH (UPDLOCK, HOLDLOCK)
    ON ledger.retailOrgId = @RetailOrgId
   AND ledger.inventoryLocationId = il.id
   AND ledger.productId = p.id
  GROUP BY
    src.sourceRow,
    src.productCode,
    p.name,
    src.storeCode,
    src.locationCode,
    s.id,
    il.id,
    il.warehouseId,
    p.id,
    p.baseCostPrice,
    src.targetQuantity;

  SELECT
    @ExpectedDatabase AS databaseName,
    CASE WHEN @ApplyChanges = 1 THEN N'APPLY' ELSE N'PREVIEW' END AS mode,
    @RetailOrgId AS retailOrgId,
    COUNT(*) AS workbookRows,
    SUM(CASE WHEN deltaQuantity <> 0 THEN 1 ELSE 0 END) AS ledgerRowsToInsert,
    CAST(SUM(currentQuantity) AS decimal(18, 3)) AS currentQuantity,
    CAST(SUM(targetQuantity) AS decimal(18, 3)) AS targetQuantity,
    CAST(SUM(deltaQuantity) AS decimal(18, 3)) AS totalDelta,
    (SELECT COUNT(*) FROM #TrackingNormalization) AS trackingProductsToNormalize,
    18 AS ignoredNegativeRows,
    217 AS ignoredPlaceholderRows
  FROM #Adjustment;

  SELECT
    storeCode,
    locationCode,
    COUNT(*) AS workbookRows,
    CAST(SUM(currentQuantity) AS decimal(18, 3)) AS currentQuantity,
    CAST(SUM(targetQuantity) AS decimal(18, 3)) AS targetQuantity,
    CAST(SUM(deltaQuantity) AS decimal(18, 3)) AS totalDelta
  FROM #Adjustment
  GROUP BY storeCode, locationCode
  ORDER BY storeCode;

  SELECT
    sourceRow,
    productCode,
    productName,
    storeCode,
    locationCode,
    currentQuantity,
    targetQuantity,
    deltaQuantity
  FROM #Adjustment
  WHERE deltaQuantity <> 0
  ORDER BY storeCode, productCode;

  IF @ApplyChanges = 0
  BEGIN
    ROLLBACK TRANSACTION;
    PRINT 'PREVIEW ONLY: no rows were changed. Set @ApplyChanges = 1 after reviewing the output.';
    RETURN;
  END;

  UPDATE product
  SET
    product.isSerialized = 0,
    product.trackExpiry = 0,
    product.lastModifiedByNodeCode = N'HQ_PRODUCTION_STOCK_IMPORT',
    product.recordVersion = product.recordVersion + 1,
    product.updatedAt = SYSUTCDATETIME()
  FROM dbo.Product AS product
  JOIN #TrackingNormalization AS tracked
    ON tracked.productId = product.id;

  DECLARE @NormalizedTrackingProducts int = @@ROWCOUNT;

  INSERT INTO dbo.InventoryLedgerEntry (
    id,
    retailOrgId,
    storeId,
    warehouseId,
    inventoryLocationId,
    productId,
    movementType,
    quantity,
    unitCost,
    referenceType,
    referenceId,
    externalReference,
    sourceNodeCode,
    occurredAt
  )
  SELECT
    CONVERT(nvarchar(36), NEWID()),
    @RetailOrgId,
    adjustment.storeId,
    adjustment.warehouseId,
    adjustment.inventoryLocationId,
    adjustment.productId,
    N'COUNT_VARIANCE',
    adjustment.deltaQuantity,
    adjustment.unitCost,
    N'PRODUCTION_STOCK_WORKBOOK_IMPORT',
    @BatchId,
    CONCAT(N'stocks.xlsx:', @WorkbookSha256),
    N'HQ_PRODUCTION_STOCK_IMPORT',
    @StockAsOf
  FROM #Adjustment AS adjustment
  WHERE adjustment.deltaQuantity <> 0;

  DECLARE @InsertedLedgerRows int = @@ROWCOUNT;

  IF EXISTS (
    SELECT 1
    FROM #Adjustment AS adjustment
    OUTER APPLY (
      SELECT CAST(COALESCE(SUM(ledger.quantity), 0) AS decimal(18, 3)) AS finalQuantity
      FROM dbo.InventoryLedgerEntry AS ledger
      WHERE ledger.retailOrgId = @RetailOrgId
        AND ledger.inventoryLocationId = adjustment.inventoryLocationId
        AND ledger.productId = adjustment.productId
    ) AS balance
    WHERE balance.finalQuantity <> adjustment.targetQuantity
  )
    THROW 51009, 'Post-insert inventory verification did not match the workbook targets.', 1;

  DECLARE @DetailsJson nvarchar(max) = CONCAT(
      N'{"sourceWorkbook":"stocks.xlsx","sourceWorksheet":"STOCK BY LOCATION","sourceWorkbookSha256":"',
    @WorkbookSha256,
    N'","stockAsOf":"',
    CONVERT(nvarchar(30), @StockAsOf, 126),
    N'","includedPositiveRows":272,"includedQuantity":8786.000,',
    N'"ignoredNegativeRows":18,"ignoredPlaceholderRows":217,"normalizedTrackingProducts":',
    @NormalizedTrackingProducts,
    N',"insertedLedgerRows":',
    @InsertedLedgerRows,
    N'}'
  );

  INSERT INTO dbo.SecurityLog (
    id,
    retailOrgId,
    kind,
    severity,
    category,
    action,
    actorLabel,
    targetType,
    targetRef,
    sourceNodeCode,
    message,
    detailsJson
  )
  VALUES (
    CONVERT(nvarchar(36), NEWID()),
    @RetailOrgId,
    N'AUDIT',
    N'HIGH',
    N'DATA_IMPORT',
    N'PRODUCTION_STOCK_WORKBOOK_QUANTITIES_IMPORTED',
    N'VPS database stock import script',
    N'InventoryLedgerEntry',
    @BatchId,
    N'HQ_PRODUCTION_STOCK_IMPORT',
    CONCAT(
      N'Applied ',
      @InsertedLedgerRows,
      N' inventory-ledger adjustments from stocks.xlsx and normalized ',
      @NormalizedTrackingProducts,
      N' product tracking flags; negative balances were ignored.'
    ),
    @DetailsJson
  );

  COMMIT TRANSACTION;

  SELECT
    N'APPLIED' AS result,
    @BatchId AS batchId,
    @NormalizedTrackingProducts AS normalizedTrackingProducts,
    @InsertedLedgerRows AS insertedLedgerRows,
    CAST(SUM(targetQuantity) AS decimal(18, 3)) AS finalWorkbookQuantity
  FROM #Adjustment;
END TRY
BEGIN CATCH
  IF XACT_STATE() <> 0
    ROLLBACK TRANSACTION;
  THROW;
END CATCH;
"@

$outputDirectory = Split-Path -Parent $resolvedOutputPath
[IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
[IO.File]::WriteAllText($resolvedOutputPath, $sql, [Text.UTF8Encoding]::new($false))

[pscustomobject]@{
  OutputPath = $resolvedOutputPath
  DatabaseName = $DatabaseName
  WorkbookSha256 = $workbookSha256
  IncludedRows = $positiveRows.Count
  IncludedQuantity = $positiveQuantity
  IgnoredNegativeRows = $negativeRows.Count
  IgnoredPlaceholderRows = $placeholderRows.Count
} | ConvertTo-Json
