export type SalesOrderCollectionPeriod = {
  dateFrom?: string | Date | null;
  dateTo?: string | Date | null;
};
export type SalesOrderCollectionSource = {
  status: string;
  totalAmount: number;
  depositAmount: number;
  balanceAmount: number;
  depositPaidAt?: string | Date | null;
  fulfilledAt?: string | Date | null;
};
export type SalesOrderCollectionReconciliation = {
  depositCollectedInPeriod: boolean;
  fulfilmentInPeriod: boolean;
  salesRecognizedAmount: number;
  openingDepositCollectedAmount: number;
  priorDepositAppliedAmount: number;
  balanceCollectedAmount: number;
  expectedTenderAmount: number;
  outstandingBalanceAmount: number;
};
export declare function reconcileSalesOrderCollections(
  source: SalesOrderCollectionSource,
  period?: SalesOrderCollectionPeriod,
): SalesOrderCollectionReconciliation | null;
