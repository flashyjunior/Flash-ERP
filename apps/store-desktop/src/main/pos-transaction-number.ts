import { randomInt } from "node:crypto";

export const POS_RECEIPT_SERIES_TOKEN_METADATA_KEY =
  "pos_receipt_series_token";
export const POS_RECEIPT_SEQUENCE_METADATA_KEY = "transaction_sequence";
export const POS_RECEIPT_MAX_SEQUENCE = 9_999;

const POS_RECEIPT_SERIES_TOKEN_LENGTH = 7;
const POS_RECEIPT_SERIES_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const POS_RECEIPT_SERIES_TOKEN_PATTERN = /^[A-Z0-9]{7}$/;
const LEGACY_POS_TRANSACTION_NUMBER_PATTERN = /^POS-ACC-\d{4}$/;

export function createPosReceiptSeriesToken() {
  return Array.from(
    { length: POS_RECEIPT_SERIES_TOKEN_LENGTH },
    () =>
      POS_RECEIPT_SERIES_ALPHABET[
        randomInt(POS_RECEIPT_SERIES_ALPHABET.length)
      ],
  ).join("");
}

export function isPosReceiptSeriesToken(
  value: string | null | undefined,
): value is string {
  return POS_RECEIPT_SERIES_TOKEN_PATTERN.test(value?.trim().toUpperCase() ?? "");
}

export function formatPosTransactionNumber(
  seriesToken: string,
  sequence: number,
) {
  const normalizedToken = seriesToken.trim().toUpperCase();
  const normalizedSequence = Math.trunc(sequence);

  if (!isPosReceiptSeriesToken(normalizedToken)) {
    throw new Error("POS receipt series tokens must contain seven letters or digits.");
  }

  if (normalizedSequence < 1 || normalizedSequence > POS_RECEIPT_MAX_SEQUENCE) {
    throw new Error(
      `POS receipt sequences must be between 1 and ${POS_RECEIPT_MAX_SEQUENCE}.`,
    );
  }

  return `POS-${normalizedToken}-${String(normalizedSequence).padStart(4, "0")}`;
}

export function isLegacyPosTransactionNumber(value: unknown) {
  return (
    typeof value === "string" &&
    LEGACY_POS_TRANSACTION_NUMBER_PATTERN.test(value.trim().toUpperCase())
  );
}
