import { type Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { reserveErpDocumentNumberInTransaction } from "@/server/services/erp-document-numbering";
import { postAccountingDocument } from "@/server/services/erp-posting-engine";
import {
  GlAccountType,
  GlJournalStatus,
  GlNormalBalance,
  RecordStatus,
  SyncNodeType
} from "@flash-erp/domain";

type FoundationContext = {
  retailOrgId: string;
  nodeCode: string;
  retailOrg: {
    code: string;
    name: string;
    baseCurrencyCode: string;
    timezone: string;
  };
};

type AccountSeed = {
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  accountGroup: string;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
  sortOrder: number;
  description: string;
};

export type UpsertErpGlAccountRequest = {
  accountCode: string;
  name: string;
  accountType: string;
  normalBalance: string;
  accountGroup?: string | null;
  externalCode?: string | null;
  description?: string | null;
  isControlAccount?: boolean;
  allowManualPosting?: boolean;
  sortOrder?: number;
  status?: string;
};

export type UpdateErpAccountingSettingsRequest = {
  baseCurrencyCode?: string | null;
  fiscalYearStartMonth?: number;
  journalNumberPrefix?: string;
  retainedEarningsAccountCode?: string | null;
  arControlAccountCode?: string | null;
  apControlAccountCode?: string | null;
  cashControlAccountCode?: string | null;
  inventoryControlAccountCode?: string | null;
  taxControlAccountCode?: string | null;
};

export type UpsertErpArApPostingProfileRequest = {
  profileCode: string;
  name: string;
  profileType: string;
  description?: string | null;
  receivablesControlAccountCode?: string | null;
  payablesControlAccountCode?: string | null;
  customerAdvanceAccountCode?: string | null;
  supplierAdvanceAccountCode?: string | null;
  withholdingTaxAccountCode?: string | null;
  customerDiscountAccountCode?: string | null;
  supplierDiscountAccountCode?: string | null;
  writeOffAccountCode?: string | null;
  exchangeGainAccountCode?: string | null;
  exchangeLossAccountCode?: string | null;
  isDefault?: boolean;
  status?: string;
};

export type UpsertErpPartyAccountingProfileRequest = {
  partyType: string;
  partyNo: string;
  postingProfileCode?: string | null;
  taxProfileCode?: string | null;
  creditTermsCode?: string | null;
  paymentTermsCode?: string | null;
  creditLimitAmount?: number | string | null;
  creditStatus?: string | null;
  allowCredit?: boolean;
  statementDeliveryMode?: string | null;
  invoiceDeliveryMode?: string | null;
  status?: string;
};

export type UpdateErpDocumentSequenceRequest = {
  documentType: string;
  prefix: string;
  suffix?: string | null;
  nextSequence?: number | string | null;
  paddingLength?: number | string | null;
  resetPolicy?: string | null;
  status?: string;
};

export type UpsertErpCurrencyRequest = {
  currencyCode: string;
  name: string;
  symbol?: string | null;
  decimalPlaces?: number | string | null;
  exchangeRateToBase?: number | string | null;
  isBaseCurrency?: boolean;
  status?: string;
};

export type PostManualJournalBatchRequest = {
  batchNo?: string | null;
  journalType?: string | null;
  postingDate: string;
  description: string;
  lines: Array<{
    accountCode: string;
    debitAmount?: number | string | null;
    creditAmount?: number | string | null;
    memo?: string | null;
  }>;
};

export type ReverseErpJournalRequest = {
  reason?: string | null;
};

export type ErpFinanceFoundationMutationResponse = {
  message: string;
  serverProcessedAt: string;
};

export type ErpFinanceFoundationWorkspaceData = {
  currencyCode: string;
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  metrics: {
    companies: number;
    currencies: number;
    fiscalPeriods: number;
    glAccounts: number;
    postedJournals: number;
    postingProfiles: number;
    partyProfiles: number;
    documentSequences: number;
    productProfiles: number;
    storageUnits: number;
  };
  accountingSettings: {
    companyId: string;
    baseCurrencyCode: string;
    fiscalYearStartMonth: number;
    journalNumberPrefix: string;
    retainedEarningsAccountCode: string;
    arControlAccountCode: string;
    apControlAccountCode: string;
    cashControlAccountCode: string;
    inventoryControlAccountCode: string;
    taxControlAccountCode: string;
  };
  accountOptions: Array<{
    accountCode: string;
    label: string;
  }>;
  postingProfileOptions: Array<{
    profileCode: string;
    profileType: string;
    label: string;
  }>;
  taxProfileOptions: Array<{
    taxProfileCode: string;
    label: string;
  }>;
  partyOptions: Array<{
    partyType: string;
    partyNo: string;
    label: string;
  }>;
  companyRows: Array<{
    companyId: string;
    companyCode: string;
    legalName: string;
    tradingName: string | null;
    baseCurrencyCode: string;
    timezone: string;
    isPrimary: boolean;
    status: string;
  }>;
  currencyRows: Array<{
    currencyCode: string;
    name: string;
    symbol: string | null;
    decimalPlaces: number;
    exchangeRateToBase: number;
    isBaseCurrency: boolean;
    status: string;
  }>;
  fiscalPeriodRows: Array<{
    periodId: string;
    fiscalYearCode: string;
    periodCode: string;
    name: string;
    startsOn: string;
    endsOn: string;
    status: string;
  }>;
  accountRows: Array<{
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    accountGroup: string | null;
    isControlAccount: boolean;
    allowManualPosting: boolean;
    externalCode: string | null;
    description: string | null;
    sortOrder: number;
    status: string;
  }>;
  arApPostingProfileRows: Array<{
    postingProfileId: string;
    profileCode: string;
    name: string;
    profileType: string;
    description: string | null;
    receivablesControlAccountCode: string;
    payablesControlAccountCode: string;
    customerAdvanceAccountCode: string;
    supplierAdvanceAccountCode: string;
    withholdingTaxAccountCode: string;
    customerDiscountAccountCode: string;
    supplierDiscountAccountCode: string;
    writeOffAccountCode: string;
    exchangeGainAccountCode: string;
    exchangeLossAccountCode: string;
    isDefault: boolean;
    status: string;
  }>;
  partyAccountingProfileRows: Array<{
    partyProfileId: string;
    partyType: string;
    partyNo: string;
    partyName: string;
    postingProfileCode: string;
    postingProfileName: string | null;
    taxProfileCode: string;
    taxProfileName: string | null;
    creditTermsCode: string;
    paymentTermsCode: string;
    creditLimitAmount: number | null;
    creditStatus: string;
    allowCredit: boolean;
    statementDeliveryMode: string;
    invoiceDeliveryMode: string;
    status: string;
  }>;
  documentSequenceRows: Array<{
    documentSequenceId: string;
    documentType: string;
    prefix: string;
    suffix: string;
    nextSequence: number;
    paddingLength: number;
    resetPolicy: string;
    fiscalYearCode: string | null;
    lastIssuedNo: string | null;
    lastIssuedAt: string | null;
    status: string;
  }>;
  journalBatchRows: Array<{
    journalBatchId: string;
    batchNo: string;
    sourceType: string;
    postingDate: string;
    description: string;
    status: string;
    totalDebit: number;
    totalCredit: number;
    entryCount: number;
  }>;
  journalRows: Array<{
    journalEntryId: string;
    journalNo: string;
    journalType: string;
    postingDate: string;
    periodCode: string | null;
    description: string;
    status: string;
    sourceType: string;
    sourceReference: string | null;
    debitAmount: number;
    creditAmount: number;
    lineCount: number;
    reversalOfJournalNo: string | null;
    hasReversal: boolean;
  }>;
  productProfileRows: Array<{
    productProfileId: string;
    productCode: string;
    name: string;
    productFamily: string;
    variantName: string | null;
    defaultUomCode: string;
    trackingMode: string;
    attributesJson: string | null;
    status: string;
  }>;
  operatingSiteRows: Array<{
    operatingSiteId: string;
    siteCode: string;
    name: string;
    siteType: string;
    location: string | null;
    city: string | null;
    region: string | null;
    storageUnitCount: number;
    status: string;
  }>;
  storageUnitRows: Array<{
    storageUnitId: string;
    storageUnitCode: string;
    name: string;
    siteCode: string;
    siteName: string;
    productCode: string | null;
    productName: string | null;
    capacityQuantity: number;
    safeCapacityQuantity: number | null;
    uomCode: string;
    status: string;
  }>;
};

const activeStatus = RecordStatus.ACTIVE;
const foundationTransactionOptions = {
  maxWait: 60_000,
  timeout: 60_000
};

function runFoundationTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(callback, foundationTransactionOptions);
}

const standardAccounts: AccountSeed[] = [
  {
    code: "1000",
    name: "Cash",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 1000,
    description: "Cash on hand and primary cash clearing."
  },
  {
    code: "1010",
    name: "Savings Account",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    sortOrder: 1010,
    description: "Savings and interest-bearing bank account balances."
  },
  {
    code: "1020",
    name: "Petty Cash",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    sortOrder: 1020,
    description: "Petty cash floats and small cash advances."
  },
  {
    code: "1100",
    name: "Accounts Receivable",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 1100,
    description: "Customer receivables control account."
  },
  {
    code: "1110",
    name: "Allowance for Doubtful Accounts",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current assets",
    sortOrder: 1110,
    description: "Contra-asset allowance for doubtful customer balances."
  },
  {
    code: "1200",
    name: "Inventory",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 1200,
    description: "Inventory and stocked item value."
  },
  {
    code: "1300",
    name: "Prepaid Expenses",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    sortOrder: 1300,
    description: "Prepaid expenses and costs deferred to future periods."
  },
  {
    code: "1350",
    name: "Employee Advances",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Current assets",
    sortOrder: 1350,
    description: "Advances issued to employees."
  },
  {
    code: "1500",
    name: "Fixed Assets - Equipment",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Fixed assets",
    sortOrder: 1500,
    description: "Equipment and machinery fixed assets."
  },
  {
    code: "1510",
    name: "Fixed Assets - Vehicles",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Fixed assets",
    sortOrder: 1510,
    description: "Motor vehicles and transport fixed assets."
  },
  {
    code: "1590",
    name: "Accumulated Depreciation",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Fixed assets",
    sortOrder: 1590,
    description: "Contra-asset accumulated depreciation."
  },
  {
    code: "1600",
    name: "Land",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Fixed assets",
    sortOrder: 1600,
    description: "Land owned by the business."
  },
  {
    code: "1610",
    name: "Buildings",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Fixed assets",
    sortOrder: 1610,
    description: "Buildings and property improvements."
  },
  {
    code: "1620",
    name: "Leasehold Improvements",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Fixed assets",
    sortOrder: 1620,
    description: "Improvements made to leased premises."
  },
  {
    code: "1700",
    name: "Other Assets",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other assets",
    sortOrder: 1700,
    description: "Other asset balances not classified elsewhere."
  },
  {
    code: "1710",
    name: "Intangible Assets",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other assets",
    sortOrder: 1710,
    description: "Intangible assets such as rights, licenses, and software."
  },
  {
    code: "1720",
    name: "Goodwill",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other assets",
    sortOrder: 1720,
    description: "Goodwill recognized on acquisition."
  },
  {
    code: "1800",
    name: "Deposits",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other assets",
    sortOrder: 1800,
    description: "Deposits paid and recoverable balances."
  },
  {
    code: "1810",
    name: "Security Deposits",
    accountType: GlAccountType.ASSET,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other assets",
    sortOrder: 1810,
    description: "Security deposits paid to landlords or counterparties."
  },
  {
    code: "2000",
    name: "Accounts Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 2000,
    description: "Supplier and vendor payable control account."
  },
  {
    code: "2010",
    name: "Accrued Expenses",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    sortOrder: 2010,
    description: "Expenses incurred but not yet paid or invoiced."
  },
  {
    code: "2020",
    name: "Payroll Liabilities",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    sortOrder: 2020,
    description: "Payroll deductions, taxes, and other payroll obligations payable."
  },
  {
    code: "2100",
    name: "Sales Tax Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 2100,
    description: "Sales tax collected and payable."
  },
  {
    code: "2200",
    name: "Short-term Loans",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    sortOrder: 2200,
    description: "Short-term borrowing due within one year."
  },
  {
    code: "2300",
    name: "Credit Cards Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Current liabilities",
    sortOrder: 2300,
    description: "Credit card balances payable."
  },
  {
    code: "2500",
    name: "Long-term Debt",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Long-term liabilities",
    sortOrder: 2500,
    description: "Long-term borrowing and debt obligations."
  },
  {
    code: "2600",
    name: "Mortgage Payable",
    accountType: GlAccountType.LIABILITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Long-term liabilities",
    sortOrder: 2600,
    description: "Mortgage obligations payable."
  },
  {
    code: "3000",
    name: "Owner's Capital",
    accountType: GlAccountType.EQUITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Equity",
    sortOrder: 3000,
    description: "Owner contributions and invested capital."
  },
  {
    code: "3100",
    name: "Retained Earnings",
    accountType: GlAccountType.EQUITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Equity",
    isControlAccount: true,
    allowManualPosting: false,
    sortOrder: 3100,
    description: "Accumulated earnings retained in the business."
  },
  {
    code: "3200",
    name: "Common Stock",
    accountType: GlAccountType.EQUITY,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Equity",
    sortOrder: 3200,
    description: "Common stock issued by the business."
  },
  {
    code: "3300",
    name: "Dividends",
    accountType: GlAccountType.EQUITY,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Equity",
    sortOrder: 3300,
    description: "Dividends distributed to owners or shareholders."
  },
  {
    code: "3400",
    name: "Owner's Draws",
    accountType: GlAccountType.EQUITY,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Equity",
    sortOrder: 3400,
    description: "Owner drawings and withdrawals."
  },
  {
    code: "4000",
    name: "Sales Revenue",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Revenue",
    sortOrder: 4000,
    description: "Revenue from sales of goods."
  },
  {
    code: "4100",
    name: "Service Revenue",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Revenue",
    sortOrder: 4100,
    description: "Revenue from services rendered."
  },
  {
    code: "4200",
    name: "Interest Income",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Other income",
    sortOrder: 4200,
    description: "Interest earned from deposits or investments."
  },
  {
    code: "4300",
    name: "Rental Income",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Other income",
    sortOrder: 4300,
    description: "Rental income earned."
  },
  {
    code: "4400",
    name: "Other Revenue",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Revenue",
    sortOrder: 4400,
    description: "Other operating revenue."
  },
  {
    code: "5000",
    name: "Cost of Goods Sold",
    accountType: GlAccountType.COST_OF_SALES,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Cost of sales",
    sortOrder: 5000,
    description: "Cost of goods sold."
  },
  {
    code: "5100",
    name: "Purchases",
    accountType: GlAccountType.COST_OF_SALES,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Cost of sales",
    sortOrder: 5100,
    description: "Purchases of goods for resale or use."
  },
  {
    code: "5200",
    name: "Freight",
    accountType: GlAccountType.COST_OF_SALES,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Cost of sales",
    sortOrder: 5200,
    description: "Freight and delivery costs."
  },
  {
    code: "6000",
    name: "Rent Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6000,
    description: "Rent expense."
  },
  {
    code: "6010",
    name: "Utilities",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6010,
    description: "Utility expenses."
  },
  {
    code: "6020",
    name: "Salaries Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6020,
    description: "Salaries expense."
  },
  {
    code: "6030",
    name: "Wages Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6030,
    description: "Wages expense."
  },
  {
    code: "6040",
    name: "Payroll Taxes Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6040,
    description: "Employer payroll taxes expense."
  },
  {
    code: "6050",
    name: "Employee Benefits",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6050,
    description: "Employee benefits expense."
  },
  {
    code: "6060",
    name: "Advertising /Marketing",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6060,
    description: "Advertising and marketing expense."
  },
  {
    code: "6070",
    name: "Office Supplies",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6070,
    description: "Office supplies expense."
  },
  {
    code: "6080",
    name: "Professional Fees",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6080,
    description: "Professional and consulting fees."
  },
  {
    code: "6090",
    name: "Insurance",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6090,
    description: "Insurance expense."
  },
  {
    code: "6100",
    name: "Depreciation Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6100,
    description: "Depreciation expense."
  },
  {
    code: "6110",
    name: "Repairs and Maintenance",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6110,
    description: "Repairs and maintenance expense."
  },
  {
    code: "6120",
    name: "Travel Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6120,
    description: "Business travel expense."
  },
  {
    code: "6130",
    name: "Meals and Entertainment",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6130,
    description: "Meals and entertainment expense."
  },
  {
    code: "6140",
    name: "Bank Fees",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6140,
    description: "Bank charges and fees."
  },
  {
    code: "6150",
    name: "Interest Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6150,
    description: "Interest expense."
  },
  {
    code: "6160",
    name: "Taxes Expense",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Operating expenses",
    sortOrder: 6160,
    description: "Taxes expense."
  },
  {
    code: "7000",
    name: "Other Income",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Other income",
    sortOrder: 7000,
    description: "Other income."
  },
  {
    code: "7010",
    name: "Gain on Sale of Assets",
    accountType: GlAccountType.REVENUE,
    normalBalance: GlNormalBalance.CREDIT,
    accountGroup: "Other income",
    sortOrder: 7010,
    description: "Gain on disposal or sale of assets."
  },
  {
    code: "8000",
    name: "Other Expenses",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other expenses",
    sortOrder: 8000,
    description: "Other expenses."
  },
  {
    code: "8010",
    name: "Loss on Sale of Assets",
    accountType: GlAccountType.EXPENSE,
    normalBalance: GlNormalBalance.DEBIT,
    accountGroup: "Other expenses",
    sortOrder: 8010,
    description: "Loss on disposal or sale of assets."
  }
];

const productProfileSeeds = [
  {
    code: "BULK-STOCK",
    name: "Bulk stock item",
    productFamily: "STOCK",
    variantName: "Bulk",
    defaultUomCode: "UNIT",
    trackingMode: "QUANTITY",
    attributesJson: null
  },
  {
    code: "RETAIL-STOCK",
    name: "Retail stock item",
    productFamily: "STOCK",
    variantName: "Retail",
    defaultUomCode: "EA",
    trackingMode: "QUANTITY",
    attributesJson: null
  },
  {
    code: "SERVICE",
    name: "Service item",
    productFamily: "SERVICE",
    variantName: null,
    defaultUomCode: "EA",
    trackingMode: "NON_STOCK",
    attributesJson: null
  },
  {
    code: "ASSET-PART",
    name: "Asset spare part",
    productFamily: "MAINTENANCE",
    variantName: "Spare",
    defaultUomCode: "EA",
    trackingMode: "QUANTITY",
    attributesJson: null
  }
] as const;

const arApPostingProfileSeeds = [
  {
    code: "DEFAULT-CUSTOMER",
    name: "Default customer posting",
    profileType: "CUSTOMER",
    description: "Default AR controls for customer invoices, receipts, discounts, and write-offs.",
    receivablesControlAccountCode: "1100",
    payablesControlAccountCode: null,
    customerAdvanceAccountCode: "2010",
    supplierAdvanceAccountCode: null,
    withholdingTaxAccountCode: "2100",
    customerDiscountAccountCode: "8000",
    supplierDiscountAccountCode: null,
    writeOffAccountCode: "1110",
    exchangeGainAccountCode: "7000",
    exchangeLossAccountCode: "8000",
    isDefault: true
  },
  {
    code: "DEFAULT-SUPPLIER",
    name: "Default supplier posting",
    profileType: "SUPPLIER",
    description: "Default AP controls for supplier invoices, payments, advances, and discounts.",
    receivablesControlAccountCode: null,
    payablesControlAccountCode: "2000",
    customerAdvanceAccountCode: null,
    supplierAdvanceAccountCode: "1800",
    withholdingTaxAccountCode: "2100",
    customerDiscountAccountCode: null,
    supplierDiscountAccountCode: "4400",
    writeOffAccountCode: null,
    exchangeGainAccountCode: "7000",
    exchangeLossAccountCode: "8000",
    isDefault: true
  }
] as const;

const documentSequenceSeeds = [
  { documentType: "JOURNAL", prefix: "GL", resetPolicy: "FISCAL_YEAR" },
  { documentType: "JOURNAL_REVERSAL", prefix: "REV", resetPolicy: "FISCAL_YEAR" },
  { documentType: "RECURRING_JOURNAL", prefix: "RJ", resetPolicy: "FISCAL_YEAR" },
  { documentType: "SALES_INVOICE", prefix: "INV", resetPolicy: "FISCAL_YEAR" },
  { documentType: "CUSTOMER_CREDIT_NOTE", prefix: "CCN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "CUSTOMER_DEBIT_NOTE", prefix: "CDN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "SALES_RECEIPT", prefix: "RCT", resetPolicy: "FISCAL_YEAR" },
  { documentType: "SUPPLIER_INVOICE", prefix: "SI", resetPolicy: "FISCAL_YEAR" },
  { documentType: "PURCHASE_ORDER", prefix: "PO", resetPolicy: "FISCAL_YEAR" },
  { documentType: "SUPPLIER_CREDIT_NOTE", prefix: "SCN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "SUPPLIER_DEBIT_NOTE", prefix: "SDN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "GOODS_RECEIPT", prefix: "GRN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "PAYMENT_VOUCHER", prefix: "PV", resetPolicy: "FISCAL_YEAR" },
  { documentType: "RECEIPT_VOUCHER", prefix: "RV", resetPolicy: "FISCAL_YEAR" },
  { documentType: "CASHBOOK_ENTRY", prefix: "CB", resetPolicy: "FISCAL_YEAR" },
  { documentType: "BANK_TRANSFER", prefix: "BT", resetPolicy: "FISCAL_YEAR" },
  { documentType: "PETTY_CASH", prefix: "PC", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FIXED_ASSET", prefix: "FA", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FIXED_ASSET_TXN", prefix: "FAT", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FUEL_DELIVERY", prefix: "FD", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FUEL_STATION_DELIVERY", prefix: "FSD", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FUEL_SALE", prefix: "FS", resetPolicy: "FISCAL_YEAR" },
  { documentType: "FUEL_RECONCILIATION", prefix: "FR", resetPolicy: "FISCAL_YEAR" },
  { documentType: "CREDIT_NOTE", prefix: "CN", resetPolicy: "FISCAL_YEAR" },
  { documentType: "DEBIT_NOTE", prefix: "DN", resetPolicy: "FISCAL_YEAR" }
] as const;

const currencyNames: Record<string, { name: string; symbol: string }> = {
  GHS: { name: "Ghana cedi", symbol: "GHS" },
  USD: { name: "US dollar", symbol: "$" },
  EUR: { name: "Euro", symbol: "EUR" },
  GBP: { name: "Pound sterling", symbol: "GBP" }
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${label}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function normalizeCode(value: string | null | undefined, label: string) {
  const code = normalizeRequiredText(value, label)
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase()
    .slice(0, 32);

  if (!code) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return code;
}

function normalizePostingProfileType(value: string | null | undefined) {
  const profileType = normalizeCode(value, "profile type");

  if (!["CUSTOMER", "SUPPLIER"].includes(profileType)) {
    throw new Error("Flash ERP posting profile type must be CUSTOMER or SUPPLIER.");
  }

  return profileType;
}

function normalizePartyType(value: string | null | undefined) {
  const partyType = normalizeCode(value, "party type");

  if (!["CUSTOMER", "SUPPLIER"].includes(partyType)) {
    throw new Error("Flash ERP party type must be CUSTOMER or SUPPLIER.");
  }

  return partyType;
}

function normalizeOptionalMoney(value: number | string | null | undefined, label: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = Number(Number(value).toFixed(2));

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs ${label} to be zero or greater.`);
  }

  return normalized;
}

function normalizeWholeNumber(value: number | string | null | undefined, fallback: number, label: string) {
  const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);
  const normalized = Math.trunc(parsed);

  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`Flash ERP needs a valid ${label}.`);
  }

  return normalized;
}

function normalizePositiveDecimal(
  value: number | string | null | undefined,
  fallback: number,
  label: string,
  precision = 6
) {
  const parsed = value === null || value === undefined || value === "" ? fallback : Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Flash ERP needs ${label} to be greater than zero.`);
  }

  return parsed.toFixed(precision);
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function monthStart(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
}

function monthEnd(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
}

function getCurrencyMetadata(code: string) {
  return currencyNames[code] ?? { name: code, symbol: code };
}

function buildUnavailableErpFinanceFoundationWorkspace(
  reason: string,
  currencyCode = "GHS"
): ErpFinanceFoundationWorkspaceData {
  return {
    currencyCode,
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    metrics: {
      companies: 0,
      currencies: 0,
      fiscalPeriods: 0,
      glAccounts: 0,
      postedJournals: 0,
      postingProfiles: 0,
      partyProfiles: 0,
      documentSequences: 0,
      productProfiles: 0,
      storageUnits: 0
    },
    accountingSettings: {
      companyId: "",
      baseCurrencyCode: currencyCode,
      fiscalYearStartMonth: 1,
      journalNumberPrefix: "GL",
      retainedEarningsAccountCode: "",
      arControlAccountCode: "",
      apControlAccountCode: "",
      cashControlAccountCode: "",
      inventoryControlAccountCode: "",
      taxControlAccountCode: ""
    },
    accountOptions: [],
    postingProfileOptions: [],
    taxProfileOptions: [],
    partyOptions: [],
    companyRows: [],
    currencyRows: [],
    fiscalPeriodRows: [],
    accountRows: [],
    arApPostingProfileRows: [],
    partyAccountingProfileRows: [],
    documentSequenceRows: [],
    journalBatchRows: [],
    journalRows: [],
    productProfileRows: [],
    operatingSiteRows: [],
    storageUnitRows: []
  };
}

export { buildUnavailableErpFinanceFoundationWorkspace };

async function getFoundationContext(tx: Prisma.TransactionClient = prisma): Promise<FoundationContext | null> {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: activeStatus
    },
    select: {
      code: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          code: true,
          name: true,
          baseCurrencyCode: true,
          timezone: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    return null;
  }

  return {
    retailOrgId: enterpriseNode.retailOrgId,
    nodeCode: enterpriseNode.code,
    retailOrg: enterpriseNode.retailOrg
  };
}

async function ensurePrimaryCompany(
  tx: Prisma.TransactionClient,
  context: FoundationContext
) {
  const companyCode = normalizeCode(context.retailOrg.code || "FLASH-ERP", "company code");
  const existingPrimary = await tx.erpCompany.findFirst({
    where: {
      retailOrgId: context.retailOrgId,
      isPrimary: true,
      status: activeStatus
    }
  });

  if (existingPrimary) {
    return existingPrimary;
  }

  return tx.erpCompany.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: companyCode
      }
    },
    update: {
      legalName: context.retailOrg.name,
      tradingName: context.retailOrg.name,
      baseCurrencyCode: context.retailOrg.baseCurrencyCode,
      timezone: context.retailOrg.timezone,
      isPrimary: true,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      code: companyCode,
      legalName: context.retailOrg.name,
      tradingName: context.retailOrg.name,
      baseCurrencyCode: context.retailOrg.baseCurrencyCode,
      timezone: context.retailOrg.timezone,
      isPrimary: true,
      status: activeStatus
    }
  });
}

async function ensureCurrencies(tx: Prisma.TransactionClient, context: FoundationContext) {
  const currencyCodes = Array.from(new Set([context.retailOrg.baseCurrencyCode, "USD"]));

  for (const code of currencyCodes) {
    const metadata = getCurrencyMetadata(code);

    await tx.erpCurrency.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code
        }
      },
      update: {
        name: metadata.name,
        symbol: metadata.symbol,
        isBaseCurrency: code === context.retailOrg.baseCurrencyCode,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        code,
        name: metadata.name,
        symbol: metadata.symbol,
        isBaseCurrency: code === context.retailOrg.baseCurrencyCode,
        exchangeRateToBase: code === context.retailOrg.baseCurrencyCode ? "1.000000" : "1.000000",
        status: activeStatus
      }
    });
  }
}

async function ensureChartOfAccounts(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  for (const seed of standardAccounts) {
    await tx.glAccount.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: seed.code
        }
      },
      update: {
        companyId,
        name: seed.name,
        accountType: seed.accountType,
        normalBalance: seed.normalBalance,
        accountGroup: seed.accountGroup,
        isControlAccount: Boolean(seed.isControlAccount),
        allowManualPosting: seed.allowManualPosting ?? true,
        sortOrder: seed.sortOrder,
        description: seed.description,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        code: seed.code,
        name: seed.name,
        accountType: seed.accountType,
        normalBalance: seed.normalBalance,
        accountGroup: seed.accountGroup,
        isControlAccount: Boolean(seed.isControlAccount),
        allowManualPosting: seed.allowManualPosting ?? true,
        sortOrder: seed.sortOrder,
        description: seed.description,
        status: activeStatus
      }
    });
  }
}

async function ensureAccountingSettings(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  return tx.erpAccountingSettings.upsert({
    where: {
      companyId
    },
    update: {
      baseCurrencyCode: context.retailOrg.baseCurrencyCode,
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId,
      baseCurrencyCode: context.retailOrg.baseCurrencyCode,
      fiscalYearStartMonth: 1,
      journalNumberPrefix: "GL",
      retainedEarningsAccountCode: "3100",
      arControlAccountCode: "1100",
      apControlAccountCode: "2000",
      cashControlAccountCode: "1000",
      inventoryControlAccountCode: "1200",
      taxControlAccountCode: "2100",
      status: activeStatus
    }
  });
}

async function ensureFiscalCalendar(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  const currentYear = new Date().getUTCFullYear();
  const fiscalYearCode = `FY${currentYear}`;
  const fiscalYear = await tx.erpFiscalYear.upsert({
    where: {
      companyId_code: {
        companyId,
        code: fiscalYearCode
      }
    },
    update: {
      name: `Fiscal year ${currentYear}`,
      startsOn: monthStart(currentYear, 0),
      endsOn: monthEnd(currentYear, 11),
      status: "OPEN"
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId,
      code: fiscalYearCode,
      name: `Fiscal year ${currentYear}`,
      startsOn: monthStart(currentYear, 0),
      endsOn: monthEnd(currentYear, 11),
      status: "OPEN"
    }
  });

  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const monthNo = monthIndex + 1;
    const periodCode = `${currentYear}-${String(monthNo).padStart(2, "0")}`;

    await tx.erpFiscalPeriod.upsert({
      where: {
        companyId_code: {
          companyId,
          code: periodCode
        }
      },
      update: {
        fiscalYearId: fiscalYear.id,
        name: new Date(Date.UTC(currentYear, monthIndex, 1)).toLocaleString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC"
        }),
        startsOn: monthStart(currentYear, monthIndex),
        endsOn: monthEnd(currentYear, monthIndex),
        status: "OPEN"
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        fiscalYearId: fiscalYear.id,
        periodNo: monthNo,
        code: periodCode,
        name: new Date(Date.UTC(currentYear, monthIndex, 1)).toLocaleString("en-US", {
          month: "long",
          year: "numeric",
          timeZone: "UTC"
        }),
        startsOn: monthStart(currentYear, monthIndex),
        endsOn: monthEnd(currentYear, monthIndex),
        status: "OPEN"
      }
    });
  }
}

async function ensureProductFoundation(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  const productsByCode = new Map<string, { id: string; code: string }>();

  for (const seed of productProfileSeeds) {
    const product = await tx.erpProductProfile.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code: seed.code
        }
      },
      update: {
        companyId,
        name: seed.name,
        productFamily: seed.productFamily,
        variantName: seed.variantName,
        defaultUomCode: seed.defaultUomCode,
        trackingMode: seed.trackingMode,
        attributesJson: seed.attributesJson,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        code: seed.code,
        name: seed.name,
        productFamily: seed.productFamily,
        variantName: seed.variantName,
        defaultUomCode: seed.defaultUomCode,
        trackingMode: seed.trackingMode,
        attributesJson: seed.attributesJson,
        status: activeStatus
      }
    });
    productsByCode.set(product.code, product);
  }

  const mainSite = await tx.erpOperatingSite.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: context.retailOrgId,
        code: "MAIN-SITE"
      }
    },
    update: {
      companyId,
      name: "Main operating site",
      siteType: "LOCATION",
      status: activeStatus
    },
    create: {
      retailOrgId: context.retailOrgId,
      companyId,
      code: "MAIN-SITE",
      name: "Main operating site",
      siteType: "LOCATION",
      status: activeStatus
    }
  });

  const storageUnitSeeds = [
    { code: "BULK-01", name: "Bulk storage 01", productCode: "BULK-STOCK", capacityQuantity: "100000.000" },
    { code: "RETAIL-01", name: "Retail storage 01", productCode: "RETAIL-STOCK", capacityQuantity: "25000.000" }
  ];

  for (const seed of storageUnitSeeds) {
    const product = productsByCode.get(seed.productCode);

    await tx.erpStorageUnit.upsert({
      where: {
        operatingSiteId_code: {
          operatingSiteId: mainSite.id,
          code: seed.code
        }
      },
      update: {
        productProfileId: product?.id ?? null,
        name: seed.name,
        capacityQuantity: seed.capacityQuantity,
        safeCapacityQuantity: String(Number(seed.capacityQuantity) * 0.9),
        uomCode: "UNIT",
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        operatingSiteId: mainSite.id,
        productProfileId: product?.id ?? null,
        code: seed.code,
        name: seed.name,
        capacityQuantity: seed.capacityQuantity,
        safeCapacityQuantity: String(Number(seed.capacityQuantity) * 0.9),
        uomCode: "UNIT",
        status: activeStatus
      }
    });
  }
}

async function ensureArApPostingProfiles(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  for (const seed of arApPostingProfileSeeds) {
    await tx.erpArApPostingProfile.upsert({
      where: {
        companyId_code: {
          companyId,
          code: seed.code
        }
      },
      update: {
        name: seed.name,
        profileType: seed.profileType,
        description: seed.description,
        receivablesControlAccountCode: seed.receivablesControlAccountCode,
        payablesControlAccountCode: seed.payablesControlAccountCode,
        customerAdvanceAccountCode: seed.customerAdvanceAccountCode,
        supplierAdvanceAccountCode: seed.supplierAdvanceAccountCode,
        withholdingTaxAccountCode: seed.withholdingTaxAccountCode,
        customerDiscountAccountCode: seed.customerDiscountAccountCode,
        supplierDiscountAccountCode: seed.supplierDiscountAccountCode,
        writeOffAccountCode: seed.writeOffAccountCode,
        exchangeGainAccountCode: seed.exchangeGainAccountCode,
        exchangeLossAccountCode: seed.exchangeLossAccountCode,
        isDefault: seed.isDefault,
        status: activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        code: seed.code,
        name: seed.name,
        profileType: seed.profileType,
        description: seed.description,
        receivablesControlAccountCode: seed.receivablesControlAccountCode,
        payablesControlAccountCode: seed.payablesControlAccountCode,
        customerAdvanceAccountCode: seed.customerAdvanceAccountCode,
        supplierAdvanceAccountCode: seed.supplierAdvanceAccountCode,
        withholdingTaxAccountCode: seed.withholdingTaxAccountCode,
        customerDiscountAccountCode: seed.customerDiscountAccountCode,
        supplierDiscountAccountCode: seed.supplierDiscountAccountCode,
        writeOffAccountCode: seed.writeOffAccountCode,
        exchangeGainAccountCode: seed.exchangeGainAccountCode,
        exchangeLossAccountCode: seed.exchangeLossAccountCode,
        isDefault: seed.isDefault,
        status: activeStatus
      }
    });
  }
}

async function ensurePartyAccountingProfiles(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  const [customerPostingProfile, supplierPostingProfile, defaultTaxProfile, customers, suppliers] =
    await Promise.all([
      tx.erpArApPostingProfile.findFirst({
        where: {
          companyId,
          profileType: "CUSTOMER",
          isDefault: true,
          status: activeStatus
        },
        select: {
          id: true
        }
      }),
      tx.erpArApPostingProfile.findFirst({
        where: {
          companyId,
          profileType: "SUPPLIER",
          isDefault: true,
          status: activeStatus
        },
        select: {
          id: true
        }
      }),
      tx.taxProfile.findFirst({
        where: {
          retailOrgId: context.retailOrgId,
          isDefault: true,
          status: activeStatus
        },
        select: {
          id: true
        }
      }),
      tx.customer.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          deletedAt: null,
          status: {
            not: RecordStatus.DELETED
          }
        },
        select: {
          id: true,
          customerNo: true,
          fullName: true,
          allowCreditSales: true,
          creditLimitAmount: true,
          status: true
        }
      }),
      tx.supplier.findMany({
        where: {
          retailOrgId: context.retailOrgId,
          deletedAt: null,
          status: {
            not: RecordStatus.DELETED
          }
        },
        select: {
          id: true,
          supplierNo: true,
          name: true,
          status: true
        }
      })
    ]);

  for (const customer of customers) {
    await tx.erpPartyAccountingProfile.upsert({
      where: {
        companyId_partyType_partyNo: {
          companyId,
          partyType: "CUSTOMER",
          partyNo: customer.customerNo
        }
      },
      update: {
        partyName: customer.fullName,
        customerId: customer.id,
        supplierId: null,
        status: customer.status
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        partyType: "CUSTOMER",
        partyNo: customer.customerNo,
        partyName: customer.fullName,
        customerId: customer.id,
        postingProfileId: customerPostingProfile?.id ?? null,
        taxProfileId: defaultTaxProfile?.id ?? null,
        creditTermsCode: customer.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT",
        paymentTermsCode: customer.allowCreditSales ? "NET-30" : "DUE-ON-RECEIPT",
        creditLimitAmount: customer.creditLimitAmount === null ? null : String(customer.creditLimitAmount),
        creditStatus: customer.allowCreditSales ? activeStatus : "CASH_ONLY",
        allowCredit: customer.allowCreditSales,
        statementDeliveryMode: "EMAIL",
        invoiceDeliveryMode: "EMAIL",
        status: customer.status
      }
    });
  }

  for (const supplier of suppliers) {
    await tx.erpPartyAccountingProfile.upsert({
      where: {
        companyId_partyType_partyNo: {
          companyId,
          partyType: "SUPPLIER",
          partyNo: supplier.supplierNo
        }
      },
      update: {
        partyName: supplier.name,
        customerId: null,
        supplierId: supplier.id,
        status: supplier.status
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        partyType: "SUPPLIER",
        partyNo: supplier.supplierNo,
        partyName: supplier.name,
        supplierId: supplier.id,
        postingProfileId: supplierPostingProfile?.id ?? null,
        taxProfileId: defaultTaxProfile?.id ?? null,
        creditTermsCode: "NET-30",
        paymentTermsCode: "NET-30",
        creditStatus: activeStatus,
        allowCredit: true,
        statementDeliveryMode: "EMAIL",
        invoiceDeliveryMode: "EMAIL",
        status: supplier.status
      }
    });
  }
}

async function ensureDocumentSequences(
  tx: Prisma.TransactionClient,
  context: FoundationContext,
  companyId: string
) {
  const fiscalYear = await tx.erpFiscalYear.findFirst({
    where: {
      companyId,
      status: {
        not: "CLOSED"
      }
    },
    orderBy: {
      startsOn: "desc"
    },
    select: {
      id: true
    }
  });

  if (!fiscalYear) {
    return;
  }

  for (const seed of documentSequenceSeeds) {
    await tx.erpDocumentSequence.upsert({
      where: {
        companyId_documentType_fiscalYearId: {
          companyId,
          documentType: seed.documentType,
          fiscalYearId: fiscalYear.id
        }
      },
      update: {},
      create: {
        retailOrgId: context.retailOrgId,
        companyId,
        fiscalYearId: fiscalYear.id,
        documentType: seed.documentType,
        prefix: seed.prefix,
        paddingLength: 6,
        resetPolicy: seed.resetPolicy,
        status: activeStatus
      }
    });
  }
}

async function ensureFoundation(tx: Prisma.TransactionClient, context: FoundationContext) {
  const company = await ensurePrimaryCompany(tx, context);

  await ensureCurrencies(tx, context);
  await ensureChartOfAccounts(tx, context, company.id);
  const accountingSettings = await ensureAccountingSettings(tx, context, company.id);
  await ensureFiscalCalendar(tx, context, company.id);
  await ensureProductFoundation(tx, context, company.id);
  await ensureArApPostingProfiles(tx, context, company.id);
  await ensurePartyAccountingProfiles(tx, context, company.id);
  await ensureDocumentSequences(tx, context, company.id);

  return {
    company,
    accountingSettings
  };
}

async function getOpenFiscalPeriodForDate(
  tx: Prisma.TransactionClient,
  companyId: string,
  postingDate: Date
) {
  return tx.erpFiscalPeriod.findFirst({
    where: {
      companyId,
      startsOn: {
        lte: postingDate
      },
      endsOn: {
        gte: postingDate
      },
      status: {
        not: "CLOSED"
      }
    },
    orderBy: {
      startsOn: "desc"
    }
  });
}

async function validateAccountCodes(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  codes: string[]
) {
  const normalizedCodes = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));

  if (normalizedCodes.length === 0) {
    return;
  }

  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId,
      code: {
        in: normalizedCodes
      },
      status: activeStatus
    },
    select: {
      code: true
    }
  });
  const foundCodes = new Set(accounts.map((account) => account.code));
  const missingCodes = normalizedCodes.filter((code) => !foundCodes.has(code));

  if (missingCodes.length > 0) {
    throw new Error(`Flash ERP cannot find GL account(s): ${missingCodes.join(", ")}.`);
  }
}

type AccountTypeRule = {
  fieldLabel: string;
  accountCode: string | null;
  allowedTypes: string[];
};

async function validateAccountTypeRules(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  rules: AccountTypeRule[]
) {
  const codes = Array.from(
    new Set(rules.map((rule) => rule.accountCode).filter((code): code is string => Boolean(code)))
  );

  if (codes.length === 0) {
    return;
  }

  const accounts = await tx.glAccount.findMany({
    where: {
      retailOrgId,
      code: {
        in: codes
      },
      status: activeStatus
    },
    select: {
      code: true,
      accountType: true
    }
  });
  const accountsByCode = new Map(accounts.map((account) => [account.code, account]));
  const missingCodes = codes.filter((code) => !accountsByCode.has(code));

  if (missingCodes.length > 0) {
    throw new Error(`Flash ERP cannot find GL account(s): ${missingCodes.join(", ")}.`);
  }

  const invalidRule = rules.find((rule) => {
    if (!rule.accountCode) {
      return false;
    }

    const account = accountsByCode.get(rule.accountCode);
    return account ? !rule.allowedTypes.includes(account.accountType) : false;
  });

  if (invalidRule?.accountCode) {
    const account = accountsByCode.get(invalidRule.accountCode);
    throw new Error(
      `${invalidRule.fieldLabel} must use ${invalidRule.allowedTypes
        .map(formatAccountTypeForError)
        .join(" or ")} account(s), but ${invalidRule.accountCode} is ${formatAccountTypeForError(account?.accountType ?? "UNKNOWN")}.`
    );
  }
}

function formatAccountTypeForError(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

export async function getErpFinanceFoundationWorkspace(): Promise<ErpFinanceFoundationWorkspaceData> {
  const context = await getFoundationContext();

  if (!context) {
    return buildUnavailableErpFinanceFoundationWorkspace(
      "Flash ERP enterprise node is not configured yet."
    );
  }

  const foundation = await ensureFoundation(prisma as unknown as Prisma.TransactionClient, context);
  const [
    companies,
    currencies,
    fiscalPeriods,
    accounts,
    arApPostingProfiles,
    partyAccountingProfiles,
    documentSequences,
    taxProfiles,
    customers,
    suppliers,
    journalBatches,
    journalEntries,
    productProfiles,
    operatingSites,
    storageUnits,
    settings
  ] = await Promise.all([
    prisma.erpCompany.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: [{ isPrimary: "desc" }, { code: "asc" }]
    }),
    prisma.erpCurrency.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: [{ isBaseCurrency: "desc" }, { code: "asc" }]
    }),
    prisma.erpFiscalPeriod.findMany({
      where: {
        companyId: foundation.company.id
      },
      orderBy: [{ startsOn: "asc" }],
      include: {
        fiscalYear: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.glAccount.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }]
    }),
    prisma.erpArApPostingProfile.findMany({
      where: {
        companyId: foundation.company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ profileType: "asc" }, { isDefault: "desc" }, { code: "asc" }]
    }),
    prisma.erpPartyAccountingProfile.findMany({
      where: {
        companyId: foundation.company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ partyType: "asc" }, { partyNo: "asc" }],
      include: {
        postingProfile: {
          select: {
            code: true,
            name: true
          }
        },
        taxProfile: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.erpDocumentSequence.findMany({
      where: {
        companyId: foundation.company.id,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ documentType: "asc" }],
      include: {
        fiscalYear: {
          select: {
            code: true
          }
        }
      }
    }),
    prisma.taxProfile.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ isDefault: "desc" }, { code: "asc" }]
    }),
    prisma.customer.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        deletedAt: null,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ customerNo: "asc" }],
      select: {
        customerNo: true,
        fullName: true
      }
    }),
    prisma.supplier.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        deletedAt: null,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: [{ supplierNo: "asc" }],
      select: {
        supplierNo: true,
        name: true
      }
    }),
    prisma.glJournalBatch.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: {
        postingDate: "desc"
      },
      take: 100,
      include: {
        entries: {
          select: {
            id: true
          }
        }
      }
    }),
    prisma.glJournalEntry.findMany({
      where: {
        retailOrgId: context.retailOrgId,
        sourceType: {
          in: ["MANUAL_JOURNAL", "JOURNAL_REVERSAL"]
        }
      },
      orderBy: {
        postingDate: "desc"
      },
      take: 200,
      include: {
        fiscalPeriod: {
          select: {
            code: true
          }
        },
        reversalOfJournalEntry: {
          select: {
            journalNo: true
          }
        },
        reversalEntries: {
          select: {
            id: true
          }
        },
        lines: {
          select: {
            debitAmount: true,
            creditAmount: true
          }
        }
      }
    }),
    prisma.erpProductProfile.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: {
        code: "asc"
      }
    }),
    prisma.erpOperatingSite.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: {
        code: "asc"
      },
      include: {
        storageUnits: {
          select: {
            id: true
          }
        }
      }
    }),
    prisma.erpStorageUnit.findMany({
      where: {
        retailOrgId: context.retailOrgId
      },
      orderBy: {
        code: "asc"
      },
      include: {
        operatingSite: {
          select: {
            code: true,
            name: true
          }
        },
        productProfile: {
          select: {
            code: true,
            name: true
          }
        }
      }
    }),
    prisma.erpAccountingSettings.findUnique({
      where: {
        companyId: foundation.company.id
      }
    })
  ]);

  const resolvedSettings = settings ?? foundation.accountingSettings;
  const accountOptions = accounts
    .filter((account) => account.status === activeStatus)
    .map((account) => ({
      accountCode: account.code,
      label: `${account.code} - ${account.name}`
    }));
  const postingProfileOptions = arApPostingProfiles
    .filter((profile) => profile.status === activeStatus)
    .map((profile) => ({
      profileCode: profile.code,
      profileType: profile.profileType,
      label: `${profile.code} - ${profile.name}`
    }));
  const taxProfileOptions = taxProfiles
    .filter((profile) => profile.status === activeStatus)
    .map((profile) => ({
      taxProfileCode: profile.code,
      label: `${profile.code} - ${profile.name}`
    }));
  const partyOptions = [
    ...customers.map((customer) => ({
      partyType: "CUSTOMER",
      partyNo: customer.customerNo,
      label: `${customer.customerNo} - ${customer.fullName}`
    })),
    ...suppliers.map((supplier) => ({
      partyType: "SUPPLIER",
      partyNo: supplier.supplierNo,
      label: `${supplier.supplierNo} - ${supplier.name}`
    }))
  ];

  return {
    currencyCode: context.retailOrg.baseCurrencyCode,
    companyName: foundation.company.tradingName ?? foundation.company.legalName,
    statusMessage:
      "Flash ERP accounting foundation is ready for company setup, fiscal control, manual GL posting, and operational master data.",
    refreshedAt: new Date().toISOString(),
    metrics: {
      companies: companies.length,
      currencies: currencies.length,
      fiscalPeriods: fiscalPeriods.length,
      glAccounts: accounts.length,
      postedJournals: journalEntries.filter((journal) => journal.status === GlJournalStatus.POSTED).length,
      postingProfiles: arApPostingProfiles.length,
      partyProfiles: partyAccountingProfiles.length,
      documentSequences: documentSequences.length,
      productProfiles: productProfiles.length,
      storageUnits: storageUnits.length
    },
    accountingSettings: {
      companyId: foundation.company.id,
      baseCurrencyCode: resolvedSettings.baseCurrencyCode,
      fiscalYearStartMonth: resolvedSettings.fiscalYearStartMonth,
      journalNumberPrefix: resolvedSettings.journalNumberPrefix,
      retainedEarningsAccountCode: resolvedSettings.retainedEarningsAccountCode ?? "",
      arControlAccountCode: resolvedSettings.arControlAccountCode ?? "",
      apControlAccountCode: resolvedSettings.apControlAccountCode ?? "",
      cashControlAccountCode: resolvedSettings.cashControlAccountCode ?? "",
      inventoryControlAccountCode: resolvedSettings.inventoryControlAccountCode ?? "",
      taxControlAccountCode: resolvedSettings.taxControlAccountCode ?? ""
    },
    accountOptions,
    postingProfileOptions,
    taxProfileOptions,
    partyOptions,
    companyRows: companies.map((company) => ({
      companyId: company.id,
      companyCode: company.code,
      legalName: company.legalName,
      tradingName: company.tradingName,
      baseCurrencyCode: company.baseCurrencyCode,
      timezone: company.timezone,
      isPrimary: company.isPrimary,
      status: company.status
    })),
    currencyRows: currencies.map((currency) => ({
      currencyCode: currency.code,
      name: currency.name,
      symbol: currency.symbol,
      decimalPlaces: currency.decimalPlaces,
      exchangeRateToBase: Number(currency.exchangeRateToBase),
      isBaseCurrency: currency.isBaseCurrency,
      status: currency.status
    })),
    fiscalPeriodRows: fiscalPeriods.map((period) => ({
      periodId: period.id,
      fiscalYearCode: period.fiscalYear.code,
      periodCode: period.code,
      name: period.name,
      startsOn: period.startsOn.toISOString(),
      endsOn: period.endsOn.toISOString(),
      status: period.status
    })),
    accountRows: accounts.map((account) => ({
      accountId: account.id,
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      accountGroup: account.accountGroup,
      isControlAccount: account.isControlAccount,
      allowManualPosting: account.allowManualPosting,
      externalCode: account.externalCode,
      description: account.description,
      sortOrder: account.sortOrder,
      status: account.status
    })),
    arApPostingProfileRows: arApPostingProfiles.map((profile) => ({
      postingProfileId: profile.id,
      profileCode: profile.code,
      name: profile.name,
      profileType: profile.profileType,
      description: profile.description,
      receivablesControlAccountCode: profile.receivablesControlAccountCode ?? "",
      payablesControlAccountCode: profile.payablesControlAccountCode ?? "",
      customerAdvanceAccountCode: profile.customerAdvanceAccountCode ?? "",
      supplierAdvanceAccountCode: profile.supplierAdvanceAccountCode ?? "",
      withholdingTaxAccountCode: profile.withholdingTaxAccountCode ?? "",
      customerDiscountAccountCode: profile.customerDiscountAccountCode ?? "",
      supplierDiscountAccountCode: profile.supplierDiscountAccountCode ?? "",
      writeOffAccountCode: profile.writeOffAccountCode ?? "",
      exchangeGainAccountCode: profile.exchangeGainAccountCode ?? "",
      exchangeLossAccountCode: profile.exchangeLossAccountCode ?? "",
      isDefault: profile.isDefault,
      status: profile.status
    })),
    partyAccountingProfileRows: partyAccountingProfiles.map((profile) => ({
      partyProfileId: profile.id,
      partyType: profile.partyType,
      partyNo: profile.partyNo,
      partyName: profile.partyName,
      postingProfileCode: profile.postingProfile?.code ?? "",
      postingProfileName: profile.postingProfile?.name ?? null,
      taxProfileCode: profile.taxProfile?.code ?? "",
      taxProfileName: profile.taxProfile?.name ?? null,
      creditTermsCode: profile.creditTermsCode ?? "",
      paymentTermsCode: profile.paymentTermsCode ?? "",
      creditLimitAmount:
        profile.creditLimitAmount === null ? null : Number(profile.creditLimitAmount),
      creditStatus: profile.creditStatus,
      allowCredit: profile.allowCredit,
      statementDeliveryMode: profile.statementDeliveryMode,
      invoiceDeliveryMode: profile.invoiceDeliveryMode,
      status: profile.status
    })),
    documentSequenceRows: documentSequences.map((sequence) => ({
      documentSequenceId: sequence.id,
      documentType: sequence.documentType,
      prefix: sequence.prefix,
      suffix: sequence.suffix ?? "",
      nextSequence: sequence.nextSequence,
      paddingLength: sequence.paddingLength,
      resetPolicy: sequence.resetPolicy,
      fiscalYearCode: sequence.fiscalYear.code,
      lastIssuedNo: sequence.lastIssuedNo,
      lastIssuedAt: sequence.lastIssuedAt?.toISOString() ?? null,
      status: sequence.status
    })),
    journalBatchRows: journalBatches.map((batch) => ({
      journalBatchId: batch.id,
      batchNo: batch.batchNo,
      sourceType: batch.sourceType,
      postingDate: batch.postingDate.toISOString(),
      description: batch.description,
      status: batch.status,
      totalDebit: Number(batch.totalDebit),
      totalCredit: Number(batch.totalCredit),
      entryCount: batch.entries.length
    })),
    journalRows: journalEntries.map((journal) => {
      const debitAmount = roundMoney(
        journal.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
      );
      const creditAmount = roundMoney(
        journal.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
      );

      return {
        journalEntryId: journal.id,
        journalNo: journal.journalNo,
        journalType: journal.journalType,
        postingDate: journal.postingDate.toISOString(),
        periodCode: journal.fiscalPeriod?.code ?? null,
        description: journal.description,
        status: journal.status,
        sourceType: journal.sourceType,
        sourceReference: journal.sourceReference,
        debitAmount,
        creditAmount,
        lineCount: journal.lines.length,
        reversalOfJournalNo: journal.reversalOfJournalEntry?.journalNo ?? null,
        hasReversal: journal.reversalEntries.length > 0
      };
    }),
    productProfileRows: productProfiles.map((product) => ({
      productProfileId: product.id,
      productCode: product.code,
      name: product.name,
      productFamily: product.productFamily,
      variantName: product.variantName,
      defaultUomCode: product.defaultUomCode,
      trackingMode: product.trackingMode,
      attributesJson: product.attributesJson,
      status: product.status
    })),
    operatingSiteRows: operatingSites.map((site) => ({
      operatingSiteId: site.id,
      siteCode: site.code,
      name: site.name,
      siteType: site.siteType,
      location: site.location,
      city: site.city,
      region: site.region,
      storageUnitCount: site.storageUnits.length,
      status: site.status
    })),
    storageUnitRows: storageUnits.map((storageUnit) => ({
      storageUnitId: storageUnit.id,
      storageUnitCode: storageUnit.code,
      name: storageUnit.name,
      siteCode: storageUnit.operatingSite.code,
      siteName: storageUnit.operatingSite.name,
      productCode: storageUnit.productProfile?.code ?? null,
      productName: storageUnit.productProfile?.name ?? null,
      capacityQuantity: Number(storageUnit.capacityQuantity),
      safeCapacityQuantity:
        storageUnit.safeCapacityQuantity === null ? null : Number(storageUnit.safeCapacityQuantity),
      uomCode: storageUnit.uomCode,
      status: storageUnit.status
    }))
  };
}

export async function updateErpAccountingSettings(
  input: UpdateErpAccountingSettingsRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const currentCurrencyCode = foundation.accountingSettings.baseCurrencyCode;
    const baseCurrencyCode = input.baseCurrencyCode
      ? normalizeCode(input.baseCurrencyCode, "base currency code")
      : currentCurrencyCode;
    const accountCodes = [
      input.retainedEarningsAccountCode,
      input.arControlAccountCode,
      input.apControlAccountCode,
      input.cashControlAccountCode,
      input.inventoryControlAccountCode,
      input.taxControlAccountCode
    ]
      .map((code) => code?.trim() ?? "")
      .filter(Boolean);

    await validateAccountCodes(tx, context.retailOrgId, accountCodes);

    const configuredCurrency = await tx.erpCurrency.findFirst({
      where: {
        retailOrgId: context.retailOrgId,
        code: baseCurrencyCode,
        status: activeStatus
      }
    });

    if (!configuredCurrency) {
      throw new Error("Choose an active currency from Multi Currency setup.");
    }

    if (baseCurrencyCode !== currentCurrencyCode || !configuredCurrency.isBaseCurrency) {
      await tx.erpCurrency.updateMany({
        where: {
          retailOrgId: context.retailOrgId,
          code: {
            not: baseCurrencyCode
          }
        },
        data: {
          isBaseCurrency: false
        }
      });

      await tx.erpCurrency.update({
        where: {
          id: configuredCurrency.id
        },
        data: {
          exchangeRateToBase: "1.000000",
          isBaseCurrency: true,
          status: activeStatus
        }
      });

      await tx.retailOrg.update({
        where: {
          id: context.retailOrgId
        },
        data: {
          baseCurrencyCode
        }
      });

      await tx.erpCompany.updateMany({
        where: {
          retailOrgId: context.retailOrgId
        },
        data: {
          baseCurrencyCode
        }
      });
    }

    await tx.erpAccountingSettings.update({
      where: {
        companyId: foundation.company.id
      },
      data: {
        baseCurrencyCode,
        fiscalYearStartMonth: Math.max(
          1,
          Math.min(12, Math.trunc(Number(input.fiscalYearStartMonth ?? 1)))
        ),
        journalNumberPrefix: normalizeCode(input.journalNumberPrefix ?? "GL", "journal prefix"),
        retainedEarningsAccountCode: normalizeOptionalText(input.retainedEarningsAccountCode),
        arControlAccountCode: normalizeOptionalText(input.arControlAccountCode),
        apControlAccountCode: normalizeOptionalText(input.apControlAccountCode),
        cashControlAccountCode: normalizeOptionalText(input.cashControlAccountCode),
        inventoryControlAccountCode: normalizeOptionalText(input.inventoryControlAccountCode),
        taxControlAccountCode: normalizeOptionalText(input.taxControlAccountCode)
      }
    });

    return {
      message: "Flash ERP saved the accounting settings.",
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpCurrency(
  input: UpsertErpCurrencyRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    await ensureFoundation(tx, context);
    const code = normalizeCode(input.currencyCode, "currency code");
    const name = normalizeRequiredText(input.name, "currency name");
    const status = input.status ? normalizeCode(input.status, "currency status") : activeStatus;
    const isBaseCurrency = Boolean(input.isBaseCurrency);

    if (isBaseCurrency && status !== activeStatus) {
      throw new Error("The base currency must remain active.");
    }

    const decimalPlaces = Math.min(
      6,
      normalizeWholeNumber(input.decimalPlaces, 2, "decimal places")
    );
    const exchangeRateToBase = isBaseCurrency
      ? "1.000000"
      : normalizePositiveDecimal(input.exchangeRateToBase, 1, "exchange rate to base");

    const currency = await tx.erpCurrency.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code
        }
      },
      update: {
        name,
        symbol: normalizeOptionalText(input.symbol),
        decimalPlaces,
        exchangeRateToBase,
        isBaseCurrency,
        status
      },
      create: {
        retailOrgId: context.retailOrgId,
        code,
        name,
        symbol: normalizeOptionalText(input.symbol),
        decimalPlaces,
        exchangeRateToBase,
        isBaseCurrency,
        status
      }
    });

    if (isBaseCurrency) {
      await tx.erpCurrency.updateMany({
        where: {
          retailOrgId: context.retailOrgId,
          id: {
            not: currency.id
          }
        },
        data: {
          isBaseCurrency: false
        }
      });

      await tx.retailOrg.update({
        where: {
          id: context.retailOrgId
        },
        data: {
          baseCurrencyCode: code
        }
      });

      await tx.erpCompany.updateMany({
        where: {
          retailOrgId: context.retailOrgId
        },
        data: {
          baseCurrencyCode: code
        }
      });

      await tx.erpAccountingSettings.updateMany({
        where: {
          retailOrgId: context.retailOrgId
        },
        data: {
          baseCurrencyCode: code
        }
      });
    }

    return {
      message: "Flash ERP saved the currency setup.",
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpGlAccount(
  input: UpsertErpGlAccountRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const code = normalizeCode(input.accountCode, "account code");
    const name = normalizeRequiredText(input.name, "account name");
    const accountType = normalizeCode(input.accountType, "account type");
    const normalBalance = normalizeCode(input.normalBalance, "normal balance");

    await tx.glAccount.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: context.retailOrgId,
          code
        }
      },
      update: {
        companyId: foundation.company.id,
        name,
        accountType,
        normalBalance,
        accountGroup: normalizeOptionalText(input.accountGroup),
        externalCode: normalizeOptionalText(input.externalCode),
        description: normalizeOptionalText(input.description),
        isControlAccount: Boolean(input.isControlAccount),
        allowManualPosting: input.allowManualPosting ?? true,
        sortOrder: Math.max(0, Math.trunc(Number(input.sortOrder ?? 0))),
        status: input.status ? normalizeCode(input.status, "account status") : activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        code,
        name,
        accountType,
        normalBalance,
        accountGroup: normalizeOptionalText(input.accountGroup),
        externalCode: normalizeOptionalText(input.externalCode),
        description: normalizeOptionalText(input.description),
        isControlAccount: Boolean(input.isControlAccount),
        allowManualPosting: input.allowManualPosting ?? true,
        sortOrder: Math.max(0, Math.trunc(Number(input.sortOrder ?? 0))),
        status: input.status ? normalizeCode(input.status, "account status") : activeStatus
      }
    });

    return {
      message: "Flash ERP saved the GL account.",
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpArApPostingProfile(
  input: UpsertErpArApPostingProfileRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const code = normalizeCode(input.profileCode, "posting profile code");
    const name = normalizeRequiredText(input.name, "posting profile name");
    const profileType = normalizePostingProfileType(input.profileType);
    const receivablesControlAccountCode = normalizeOptionalText(input.receivablesControlAccountCode);
    const payablesControlAccountCode = normalizeOptionalText(input.payablesControlAccountCode);
    const customerAdvanceAccountCode = normalizeOptionalText(input.customerAdvanceAccountCode);
    const supplierAdvanceAccountCode = normalizeOptionalText(input.supplierAdvanceAccountCode);
    const withholdingTaxAccountCode = normalizeOptionalText(input.withholdingTaxAccountCode);
    const customerDiscountAccountCode = normalizeOptionalText(input.customerDiscountAccountCode);
    const supplierDiscountAccountCode = normalizeOptionalText(input.supplierDiscountAccountCode);
    const writeOffAccountCode = normalizeOptionalText(input.writeOffAccountCode);
    const exchangeGainAccountCode = normalizeOptionalText(input.exchangeGainAccountCode);
    const exchangeLossAccountCode = normalizeOptionalText(input.exchangeLossAccountCode);
    const isDefault = Boolean(input.isDefault);

    if (profileType === "CUSTOMER" && !receivablesControlAccountCode) {
      throw new Error("Flash ERP customer posting profiles need an AR control account.");
    }

    if (profileType === "SUPPLIER" && !payablesControlAccountCode) {
      throw new Error("Flash ERP supplier posting profiles need an AP control account.");
    }

    await validateAccountTypeRules(tx, context.retailOrgId, [
      {
        fieldLabel: "AR control",
        accountCode: receivablesControlAccountCode,
        allowedTypes: [GlAccountType.ASSET]
      },
      {
        fieldLabel: "AP control",
        accountCode: payablesControlAccountCode,
        allowedTypes: [GlAccountType.LIABILITY]
      },
      {
        fieldLabel: "Customer advance",
        accountCode: customerAdvanceAccountCode,
        allowedTypes: [GlAccountType.LIABILITY]
      },
      {
        fieldLabel: "Supplier advance",
        accountCode: supplierAdvanceAccountCode,
        allowedTypes: [GlAccountType.ASSET]
      },
      {
        fieldLabel: "Withholding tax",
        accountCode: withholdingTaxAccountCode,
        allowedTypes: [GlAccountType.LIABILITY]
      },
      {
        fieldLabel: "Customer discount",
        accountCode: customerDiscountAccountCode,
        allowedTypes: [GlAccountType.EXPENSE]
      },
      {
        fieldLabel: "Supplier discount",
        accountCode: supplierDiscountAccountCode,
        allowedTypes: [GlAccountType.REVENUE]
      },
      {
        fieldLabel: "Write-off",
        accountCode: writeOffAccountCode,
        allowedTypes: [GlAccountType.EXPENSE]
      },
      {
        fieldLabel: "Exchange gain",
        accountCode: exchangeGainAccountCode,
        allowedTypes: [GlAccountType.REVENUE]
      },
      {
        fieldLabel: "Exchange loss",
        accountCode: exchangeLossAccountCode,
        allowedTypes: [GlAccountType.EXPENSE]
      }
    ]);

    if (isDefault) {
      await tx.erpArApPostingProfile.updateMany({
        where: {
          companyId: foundation.company.id,
          profileType,
          code: {
            not: code
          }
        },
        data: {
          isDefault: false
        }
      });
    }

    await tx.erpArApPostingProfile.upsert({
      where: {
        companyId_code: {
          companyId: foundation.company.id,
          code
        }
      },
      update: {
        name,
        profileType,
        description: normalizeOptionalText(input.description),
        receivablesControlAccountCode,
        payablesControlAccountCode,
        customerAdvanceAccountCode,
        supplierAdvanceAccountCode,
        withholdingTaxAccountCode,
        customerDiscountAccountCode,
        supplierDiscountAccountCode,
        writeOffAccountCode,
        exchangeGainAccountCode,
        exchangeLossAccountCode,
        isDefault,
        status: input.status ? normalizeCode(input.status, "posting profile status") : activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        code,
        name,
        profileType,
        description: normalizeOptionalText(input.description),
        receivablesControlAccountCode,
        payablesControlAccountCode,
        customerAdvanceAccountCode,
        supplierAdvanceAccountCode,
        withholdingTaxAccountCode,
        customerDiscountAccountCode,
        supplierDiscountAccountCode,
        writeOffAccountCode,
        exchangeGainAccountCode,
        exchangeLossAccountCode,
        isDefault,
        status: input.status ? normalizeCode(input.status, "posting profile status") : activeStatus
      }
    });

    return {
      message: `Flash ERP saved posting profile ${code}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function upsertErpPartyAccountingProfile(
  input: UpsertErpPartyAccountingProfileRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const partyType = normalizePartyType(input.partyType);
    const partyNo = normalizeCode(input.partyNo, "party number");
    const party =
      partyType === "CUSTOMER"
        ? await tx.customer.findFirst({
            where: {
              retailOrgId: context.retailOrgId,
              customerNo: partyNo,
              deletedAt: null
            },
            select: {
              id: true,
              fullName: true
            }
          })
        : await tx.supplier.findFirst({
            where: {
              retailOrgId: context.retailOrgId,
              supplierNo: partyNo,
              deletedAt: null
            },
            select: {
              id: true,
              name: true
            }
          });

    if (!party) {
      throw new Error(`Flash ERP cannot find ${partyType.toLowerCase()} ${partyNo}.`);
    }

    const partyName = "fullName" in party ? party.fullName : party.name;

    const postingProfileCode = normalizeOptionalText(input.postingProfileCode);
    const postingProfile = postingProfileCode
      ? await tx.erpArApPostingProfile.findFirst({
          where: {
            companyId: foundation.company.id,
            code: normalizeCode(postingProfileCode, "posting profile"),
            status: activeStatus
          },
          select: {
            id: true,
            profileType: true
          }
        })
      : await tx.erpArApPostingProfile.findFirst({
          where: {
            companyId: foundation.company.id,
            profileType: partyType,
            isDefault: true,
            status: activeStatus
          },
          select: {
            id: true,
            profileType: true
          }
        });

    if (!postingProfile) {
      throw new Error("Flash ERP needs an active AR/AP posting profile for that party.");
    }

    if (postingProfile.profileType !== partyType) {
      throw new Error(`Flash ERP ${partyType.toLowerCase()} profiles need a ${partyType} posting profile.`);
    }

    const taxProfileCode = normalizeOptionalText(input.taxProfileCode);
    const taxProfile = taxProfileCode
      ? await tx.taxProfile.findFirst({
          where: {
            retailOrgId: context.retailOrgId,
            code: normalizeCode(taxProfileCode, "tax profile"),
            status: activeStatus
          },
          select: {
            id: true
          }
        })
      : null;

    if (taxProfileCode && !taxProfile) {
      throw new Error(`Flash ERP cannot find tax profile ${taxProfileCode}.`);
    }

    const creditLimitAmount = normalizeOptionalMoney(input.creditLimitAmount, "credit limit");
    const allowCredit = Boolean(input.allowCredit);
    const creditStatus =
      normalizeOptionalText(input.creditStatus) ?? (allowCredit ? activeStatus : "CASH_ONLY");

    await tx.erpPartyAccountingProfile.upsert({
      where: {
        companyId_partyType_partyNo: {
          companyId: foundation.company.id,
          partyType,
          partyNo
        }
      },
      update: {
        partyName,
        customerId: partyType === "CUSTOMER" ? party.id : null,
        supplierId: partyType === "SUPPLIER" ? party.id : null,
        postingProfileId: postingProfile.id,
        taxProfileId: taxProfile?.id ?? null,
        creditTermsCode: normalizeOptionalText(input.creditTermsCode),
        paymentTermsCode: normalizeOptionalText(input.paymentTermsCode),
        creditLimitAmount: creditLimitAmount === null ? null : String(creditLimitAmount),
        creditStatus: normalizeCode(creditStatus, "credit status"),
        allowCredit,
        statementDeliveryMode:
          normalizeOptionalText(input.statementDeliveryMode)?.toUpperCase() ?? "EMAIL",
        invoiceDeliveryMode:
          normalizeOptionalText(input.invoiceDeliveryMode)?.toUpperCase() ?? "EMAIL",
        status: input.status ? normalizeCode(input.status, "party profile status") : activeStatus
      },
      create: {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        partyType,
        partyNo,
        partyName,
        customerId: partyType === "CUSTOMER" ? party.id : null,
        supplierId: partyType === "SUPPLIER" ? party.id : null,
        postingProfileId: postingProfile.id,
        taxProfileId: taxProfile?.id ?? null,
        creditTermsCode: normalizeOptionalText(input.creditTermsCode),
        paymentTermsCode: normalizeOptionalText(input.paymentTermsCode),
        creditLimitAmount: creditLimitAmount === null ? null : String(creditLimitAmount),
        creditStatus: normalizeCode(creditStatus, "credit status"),
        allowCredit,
        statementDeliveryMode:
          normalizeOptionalText(input.statementDeliveryMode)?.toUpperCase() ?? "EMAIL",
        invoiceDeliveryMode:
          normalizeOptionalText(input.invoiceDeliveryMode)?.toUpperCase() ?? "EMAIL",
        status: input.status ? normalizeCode(input.status, "party profile status") : activeStatus
      }
    });

    return {
      message: `Flash ERP saved ${partyType.toLowerCase()} accounting profile ${partyNo}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function updateErpDocumentSequence(
  input: UpdateErpDocumentSequenceRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const documentType = normalizeCode(input.documentType, "document type");
    const sequence = await tx.erpDocumentSequence.findFirst({
      where: {
        companyId: foundation.company.id,
        documentType,
        status: {
          not: RecordStatus.DELETED
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true
      }
    });

    if (!sequence) {
      throw new Error(`Flash ERP cannot find document sequence ${documentType}.`);
    }

    const nextSequence = Math.max(
      1,
      normalizeWholeNumber(input.nextSequence, 1, "next sequence")
    );
    const paddingLength = Math.max(
      1,
      Math.min(12, normalizeWholeNumber(input.paddingLength, 6, "padding length"))
    );

    await tx.erpDocumentSequence.update({
      where: {
        id: sequence.id
      },
      data: {
        prefix: normalizeCode(input.prefix, "document prefix"),
        suffix: normalizeOptionalText(input.suffix),
        nextSequence,
        paddingLength,
        resetPolicy: normalizeCode(input.resetPolicy ?? "FISCAL_YEAR", "reset policy"),
        status: input.status ? normalizeCode(input.status, "document sequence status") : activeStatus
      }
    });

    return {
      message: `Flash ERP saved numbering for ${documentType}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function postManualJournalBatch(
  input: PostManualJournalBatchRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  const journalType = normalizeCode(input.journalType ?? "GENERAL", "journal type");
  const isAdjusting = journalType === "ADJUSTING";
  const result = await postAccountingDocument({
    batchNo: input.batchNo,
    batchSourceType: isAdjusting ? "ADJUSTING" : "MANUAL",
    journalType,
    sourceType: isAdjusting ? "MANUAL_ADJUSTMENT" : "MANUAL_JOURNAL",
    postingDate: input.postingDate,
    description: input.description,
    postedBy: "Enterprise finance",
    lines: input.lines
  });

  return {
    message: `Flash ERP posted journal batch ${result.journalNo}.`,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function reverseErpJournalEntry(
  journalEntryId: string,
  input: ReverseErpJournalRequest
): Promise<ErpFinanceFoundationMutationResponse> {
  return runFoundationTransaction(async (tx) => {
    const context = await getFoundationContext(tx);

    if (!context) {
      throw new Error("Flash ERP enterprise node is not configured yet.");
    }

    const foundation = await ensureFoundation(tx, context);
    const original = await tx.glJournalEntry.findFirst({
      where: {
        id: journalEntryId,
        retailOrgId: context.retailOrgId,
        status: GlJournalStatus.POSTED
      },
      include: {
        reversalEntries: {
          select: {
            id: true
          }
        },
        lines: {
          select: {
            accountId: true,
            debitAmount: true,
            creditAmount: true,
            memo: true
          }
        }
      }
    });

    if (!original) {
      throw new Error("Flash ERP cannot find that posted journal.");
    }

    if (original.reversalEntries.length > 0) {
      throw new Error("Flash ERP has already reversed that journal.");
    }

    const reason = normalizeOptionalText(input.reason) ?? `Reversal of ${original.journalNo}`;
    const period = await getOpenFiscalPeriodForDate(tx, foundation.company.id, new Date());

    if (!period) {
      throw new Error("Flash ERP cannot find an open fiscal period for the reversal date.");
    }

    const reversalNo = (
      await reserveErpDocumentNumberInTransaction(tx, {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        documentType: "JOURNAL_REVERSAL"
      })
    ).documentNo;
    const debitTotal = roundMoney(
      original.lines.reduce((sum, line) => sum + Number(line.creditAmount), 0)
    );
    const creditTotal = roundMoney(
      original.lines.reduce((sum, line) => sum + Number(line.debitAmount), 0)
    );
    const batch = await tx.glJournalBatch.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        batchNo: reversalNo,
        sourceType: "REVERSAL",
        postingDate: new Date(),
        description: reason,
        status: GlJournalStatus.POSTED,
        totalDebit: debitTotal,
        totalCredit: creditTotal,
        postedAt: new Date()
      }
    });

    await tx.glJournalEntry.create({
      data: {
        retailOrgId: context.retailOrgId,
        companyId: foundation.company.id,
        journalBatchId: batch.id,
        fiscalPeriodId: period.id,
        journalNo: reversalNo,
        journalType: "REVERSAL",
        sourceType: "JOURNAL_REVERSAL",
        sourceId: original.id,
        sourceReference: original.journalNo,
        reversalOfJournalEntryId: original.id,
        postingDate: new Date(),
        description: reason,
        status: GlJournalStatus.POSTED,
        postedBy: "Enterprise finance",
        reversalReason: reason,
        lines: {
          create: original.lines.map((line) => ({
            accountId: line.accountId,
            debitAmount: Number(line.creditAmount),
            creditAmount: Number(line.debitAmount),
            memo: `Reversal: ${line.memo ?? original.description}`
          }))
        }
      }
    });

    return {
      message: `Flash ERP reversed journal ${original.journalNo}.`,
      serverProcessedAt: new Date().toISOString()
    };
  });
}
