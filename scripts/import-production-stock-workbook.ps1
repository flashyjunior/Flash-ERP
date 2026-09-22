<#
Prepares and imports the S Majeed Phones production catalogue workbook.

The script is dry-run by default. Pass -Execute to back up the target database,
purge its demo operational/catalogue data, create the four workbook shops, and
import the normalized products with zero opening stock.
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookPath,

  [string]$DatabaseName = "Trial",

  [string]$EnvironmentPath = "",

  [switch]$Execute,

  [switch]$AllowRehearsalDatabase,

  [switch]$SkipBackup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
  $EnvironmentPath = Join-Path $PSScriptRoot "..\.env"
}

$resolvedWorkbookPath = (Resolve-Path -LiteralPath $WorkbookPath).Path
$resolvedEnvironmentPath = (Resolve-Path -LiteralPath $EnvironmentPath).Path
$isProductionTarget = $DatabaseName -ceq "Trial"
$isRehearsalTarget = $DatabaseName -match '^Trial_Import_Rehearsal_[A-Za-z0-9_]+$'

if (-not $isProductionTarget -and -not ($AllowRehearsalDatabase -and $isRehearsalTarget)) {
  throw "The stock replacement is locked to Trial. Rehearsal databases must use the Trial_Import_Rehearsal_* naming convention and -AllowRehearsalDatabase."
}

function Get-DatabaseUrl {
  $line = Get-Content -LiteralPath $resolvedEnvironmentPath |
    Where-Object { $_ -match '^DATABASE_URL=' } |
    Select-Object -First 1

  if (-not $line) {
    throw "DATABASE_URL is missing from the selected environment file."
  }

  $url = ($line -replace '^DATABASE_URL=', '').Trim().Trim('"')
  if (-not $url.StartsWith('sqlserver://', [StringComparison]::OrdinalIgnoreCase)) {
    throw "The stock importer requires a SQL Server DATABASE_URL."
  }
  if ($url -notmatch '(?i)(^|;)database=') {
    throw "DATABASE_URL does not contain an explicit database name."
  }

  return [regex]::Replace(
    $url,
    '(?i)(^|;)database=[^;]*',
    { param($match) $match.Groups[1].Value + 'database=' + [Uri]::EscapeDataString($DatabaseName) },
    1
  )
}

function ConvertTo-Slug {
  param([string]$Value)

  $normalized = if ($null -eq $Value) { '' } else { $Value }
  return ($normalized.ToUpperInvariant() -replace '[^A-Z0-9]+', '-').Trim('-')
}

function Get-WorkbookPayload {
  $excel = $null
  $workbook = $null
  $worksheet = $null

  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Open($resolvedWorkbookPath, 0, $true)
    $worksheet = $workbook.Worksheets.Item('MASTER UPLOAD')
    $values = $worksheet.UsedRange.Value2

    $headers = @{}
    for ($column = 1; $column -le $values.GetLength(1); $column++) {
      $header = [string]$values[5, $column]
      if ($header) {
        $headers[$header.Trim()] = $column
      }
    }

    $requiredHeaders = @(
      'Product code',
      'Product name',
      'SKU',
      'Department',
      'Category',
      'Subcategory',
      'Brand',
      'Manufacturer',
      'Stock Condition',
      'Condition Code',
      'eSIM Variant',
      'Source Qualifier',
      'Location',
      'Closing Quantity',
      'Cost Price',
      'Selling Price',
      'Source Product Name'
    )
    $missingHeaders = @($requiredHeaders | Where-Object { -not $headers.ContainsKey($_) })
    if ($missingHeaders.Count -gt 0) {
      throw "MASTER UPLOAD is missing required column(s): $($missingHeaders -join ', ')."
    }

    function Get-TextValue {
      param([int]$Row, [string]$Header)
      $value = $values[$Row, $headers[$Header]]
      if ($null -eq $value) { return '' }
      return ([string]$value).Trim()
    }

    function Get-DecimalValue {
      param([int]$Row, [string]$Header)
      $value = $values[$Row, $headers[$Header]]
      if ($null -eq $value -or ([string]$value).Trim() -eq '') { return [decimal]0 }
      return [decimal]$value
    }

    $rows = @()
    for ($row = 6; $row -le $values.GetLength(0); $row++) {
      $code = Get-TextValue -Row $row -Header 'Product code'
      if (-not $code) { continue }

      $rows += [pscustomobject]@{
        row = $row
        code = $code
        name = Get-TextValue -Row $row -Header 'Product name'
        sourceSku = Get-TextValue -Row $row -Header 'SKU'
        department = Get-TextValue -Row $row -Header 'Department'
        category = Get-TextValue -Row $row -Header 'Category'
        subcategory = Get-TextValue -Row $row -Header 'Subcategory'
        brand = Get-TextValue -Row $row -Header 'Brand'
        manufacturer = Get-TextValue -Row $row -Header 'Manufacturer'
        condition = Get-TextValue -Row $row -Header 'Stock Condition'
        conditionCode = Get-TextValue -Row $row -Header 'Condition Code'
        esimVariant = Get-TextValue -Row $row -Header 'eSIM Variant'
        sourceQualifier = Get-TextValue -Row $row -Header 'Source Qualifier'
        location = Get-TextValue -Row $row -Header 'Location'
        quantity = Get-DecimalValue -Row $row -Header 'Closing Quantity'
        cost = Get-DecimalValue -Row $row -Header 'Cost Price'
        price = Get-DecimalValue -Row $row -Header 'Selling Price'
        sourceProductName = Get-TextValue -Row $row -Header 'Source Product Name'
      }
    }

    if ($rows.Count -eq 0) {
      throw "MASTER UPLOAD does not contain any product rows."
    }

    $expectedLocations = @('Abdul Rauf', 'Main Location', 'Screens & Accessories', 'SHOP B', 'No Closing Stock')
    $unexpectedLocations = @($rows.location | Sort-Object -Unique | Where-Object { $_ -notin $expectedLocations })
    if ($unexpectedLocations.Count -gt 0) {
      throw "Unexpected workbook location(s): $($unexpectedLocations -join ', ')."
    }

    $skuProductCounts = @{}
    foreach ($skuGroup in ($rows | Where-Object sourceSku | Group-Object sourceSku)) {
      $skuProductCounts[$skuGroup.Name] = @($skuGroup.Group.code | Sort-Object -Unique).Count
    }

    $products = @()
    foreach ($productGroup in ($rows | Group-Object code | Sort-Object Name)) {
      $sourceRows = @($productGroup.Group | Sort-Object row)
      $first = $sourceRows[0]
      $sourceSku = if ($first.sourceSku) { $first.sourceSku } else { $first.code }
      $sku = $sourceSku
      $variantTags = @()
      $skuProductCount = if ($skuProductCounts.ContainsKey($sourceSku)) {
        $skuProductCounts[$sourceSku]
      } else {
        0
      }

      if ($skuProductCount -gt 1) {
        if ($first.conditionCode) { $variantTags += $first.conditionCode }
        if ($first.esimVariant) { $variantTags += $first.esimVariant }
        if ($first.sourceQualifier) { $variantTags += $first.sourceQualifier }
        $variantTags += $first.code
        $sku = ConvertTo-Slug "$sourceSku-$($variantTags -join '-')"
      }

      $displayTags = @()
      if ($skuProductCount -gt 1) {
        $conditionLabel = switch ($first.conditionCode.ToUpperInvariant()) {
          'FB' { 'Fresh in Box' }
          'WB' { 'WB' }
          'STD' { 'Standard' }
          default { $first.condition }
        }
        if ($conditionLabel) { $displayTags += $conditionLabel }
        if ($first.esimVariant) { $displayTags += $first.esimVariant }
        if ($first.sourceQualifier) { $displayTags += $first.sourceQualifier }
      }
      $displayName = $first.name
      if ($displayTags.Count -gt 0) {
        $displayName = "$displayName ($($displayTags -join ', '))"
      }

      $positiveCosts = @($sourceRows.cost | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
      $prices = @($sourceRows.price | Sort-Object -Unique)
      if ($prices.Count -gt 1) {
        throw "Product $($first.code) has conflicting selling prices: $($prices -join ', ')."
      }

      $notes = @(
        "Imported from $([IO.Path]::GetFileName($resolvedWorkbookPath)).",
        "Source SKU: $sourceSku.",
        "Stock condition: $($first.condition)."
      )
      if ($first.esimVariant) { $notes += "Variant: $($first.esimVariant)." }
      if ($first.sourceQualifier) { $notes += "Source qualifier: $($first.sourceQualifier)." }
      if ($first.sourceProductName) { $notes += "Source product name: $($first.sourceProductName)." }

      $price = [decimal]$prices[0]
      $products += [pscustomobject]@{
        code = $first.code
        sourceSku = $sourceSku
        sku = $sku
        name = $displayName
        shortName = $displayName.Substring(0, [Math]::Min(80, $displayName.Length))
        department = $first.department
        category = $first.category
        subcategory = $first.subcategory
        brand = if ($first.brand) { $first.brand } else { $first.manufacturer }
        manufacturer = $first.manufacturer
        condition = $first.condition
        conditionCode = $first.conditionCode
        esimVariant = $first.esimVariant
        sourceQualifier = $first.sourceQualifier
        unitOfMeasure = 'EA'
        price = $price
        cost = if ($positiveCosts.Count -gt 0) { [decimal]$positiveCosts[-1] } else { $null }
        mustEnterPriceAtPos = $price -le 0
        notes = $notes -join ' '
        stock = @()
        sourceRows = @($sourceRows.row)
      }
    }

    $duplicateNormalizedSkus = @($products | Group-Object sku | Where-Object Count -gt 1)
    if ($duplicateNormalizedSkus.Count -gt 0) {
      throw "Normalized SKU generation produced duplicates: $($duplicateNormalizedSkus.Name -join ', ')."
    }

    $payload = [ordered]@{
      formatVersion = 1
      sourceWorkbook = [IO.Path]::GetFileName($resolvedWorkbookPath)
      sourceWorkbookPath = $resolvedWorkbookPath
      stockAsOf = '2026-09-20T23:59:59.000Z'
      preparedAt = [DateTime]::UtcNow.ToString('o')
      expectedDatabase = $DatabaseName
      locations = @(
        [ordered]@{ name = 'Main Location'; code = 'MAIN'; locationType = 'SALES_FLOOR'; useForSalesDefault = $true; routingPriority = 1; supportsPickup = $true; supportsDelivery = $true },
        [ordered]@{ name = 'Abdul Rauf'; code = 'ABDUL-RAUF'; locationType = 'SALES_FLOOR'; useForSalesDefault = $true; routingPriority = 2; supportsPickup = $true; supportsDelivery = $true },
        [ordered]@{ name = 'Screens & Accessories'; code = 'SCREENS-ACCESSORIES'; locationType = 'SALES_FLOOR'; useForSalesDefault = $true; routingPriority = 3; supportsPickup = $true; supportsDelivery = $true },
        [ordered]@{ name = 'SHOP B'; code = 'SHOP-B'; locationType = 'SALES_FLOOR'; useForSalesDefault = $true; routingPriority = 4; supportsPickup = $true; supportsDelivery = $true }
      )
      products = $products
      statistics = [ordered]@{
        sourceRows = $rows.Count
        products = $products.Count
        departments = @($products.department | Sort-Object -Unique).Count
        categories = @($products.category | Sort-Object -Unique).Count
        stockRows = 0
        totalQuantity = [decimal]0
        negativeStockRows = 0
        productsRequiringPosPrice = @($products | Where-Object mustEnterPriceAtPos).Count
        productsWithoutCost = @($products | Where-Object { $null -eq $_.cost }).Count
        serializedProducts = 0
        batchTrackedProducts = 0
      }
    }

    return $payload
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
}

function Backup-TargetDatabase {
  param([string]$DatabaseUrl)

  $parts = $DatabaseUrl.Substring(12).Split(';')
  $server = [Uri]::UnescapeDataString($parts[0])
  $settings = @{}
  foreach ($part in $parts[1..($parts.Length - 1)]) {
    $pair = $part.Split('=', 2)
    if ($pair.Length -eq 2) {
      $settings[$pair[0].ToLowerInvariant()] = [Uri]::UnescapeDataString($pair[1])
    }
  }

  $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
  $builder['Data Source'] = $server
  $builder['Initial Catalog'] = 'master'
  $builder['User ID'] = $settings['user']
  $builder['Password'] = $settings['password']
  $builder['Encrypt'] = $settings['encrypt'] -eq 'true'
  $builder['TrustServerCertificate'] = $settings['trustservercertificate'] -ne 'false'
  $builder['Application Name'] = 'Flash ERP production stock import backup'

  $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
  try {
    $connection.Open()
    $command = $connection.CreateCommand()
    $command.CommandTimeout = 0
    $safeDatabase = $DatabaseName.Replace(']', ']]')
    $timestamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
    $safeFileName = ($DatabaseName -replace '[^A-Za-z0-9_-]', '_')
    $command.CommandText = @"
DECLARE @directory nvarchar(4000) = CONVERT(nvarchar(4000), SERVERPROPERTY('InstanceDefaultBackupPath'));
IF @directory IS NULL THROW 51000, 'SQL Server has no default backup path.', 1;
IF RIGHT(@directory, 1) NOT IN ('\', '/') SET @directory = @directory + '\';
DECLARE @path nvarchar(4000) = @directory + N'$safeFileName-before-production-catalog-import-$timestamp.bak';
BACKUP DATABASE [$safeDatabase] TO DISK = @path WITH COPY_ONLY, INIT, CHECKSUM, COMPRESSION;
RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM;
SELECT @path;
"@
    $backupPath = [string]$command.ExecuteScalar()
    Write-Host "Verified backup: $backupPath" -ForegroundColor Green
    return $backupPath
  }
  finally {
    $connection.Dispose()
  }
}

$databaseUrl = Get-DatabaseUrl
$payload = Get-WorkbookPayload
$temporaryPayload = Join-Path ([IO.Path]::GetTempPath()) "flash-erp-stock-import-$([Guid]::NewGuid().ToString('N')).json"
$previousDatabaseUrl = $env:DATABASE_URL

try {
  [IO.File]::WriteAllText(
    $temporaryPayload,
    ($payload | ConvertTo-Json -Depth 12),
    [Text.UTF8Encoding]::new($false)
  )

  if ($Execute -and -not $SkipBackup) {
    [void](Backup-TargetDatabase -DatabaseUrl $databaseUrl)
  }

  $env:DATABASE_URL = $databaseUrl
  $tsx = Join-Path $PSScriptRoot "..\node_modules\.bin\tsx.cmd"
  if (-not (Test-Path -LiteralPath $tsx)) {
    throw "tsx is not installed. Run npm ci before using the stock importer."
  }

  $arguments = @(
    '--tsconfig=apps/enterprise-web/tsconfig.json',
    'scripts/import-production-stock-workbook.ts',
    '--input',
    $temporaryPayload,
    '--expected-database',
    $DatabaseName
  )
  if ($Execute) { $arguments += '--execute' }

  & $tsx @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "The production stock importer failed with exit code $LASTEXITCODE."
  }
}
finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
  Remove-Item -LiteralPath $temporaryPayload -Force -ErrorAction SilentlyContinue
}
