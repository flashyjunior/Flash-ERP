import type { StoreInterStoreTransferRequestDraftLine } from "../shared/desktop-runtime";

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredText(value: unknown): string {
  return optionalText(value) ?? "";
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readTransferRequestDraftLines(
  linesJson: string | null | undefined,
  fallback: StoreInterStoreTransferRequestDraftLine,
): StoreInterStoreTransferRequestDraftLine[] {
  try {
    const parsed = JSON.parse(linesJson || "[]") as unknown;

    if (Array.isArray(parsed) && parsed.length > 0) {
      const lines = parsed
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const candidate = entry as Record<string, unknown>;
          const productCode = requiredText(candidate.productCode);
          const productName = requiredText(candidate.productName);
          const requestedUnitOfMeasure = requiredText(
            candidate.requestedUnitOfMeasure,
          );
          const baseUnitOfMeasure = requiredText(candidate.baseUnitOfMeasure);
          const requestedUnitQuantity = finiteNumber(
            candidate.requestedUnitQuantity,
          );
          const quantity = finiteNumber(candidate.quantity);

          if (
            !productCode ||
            !productName ||
            !requestedUnitOfMeasure ||
            !baseUnitOfMeasure ||
            requestedUnitQuantity <= 0 ||
            quantity <= 0
          ) {
            return null;
          }

          return {
            lineId:
              requiredText(candidate.lineId) ||
              `${fallback.lineId}-line-${index + 1}`,
            lineNo: Math.max(
              1,
              Math.trunc(finiteNumber(candidate.lineNo, index + 1)),
            ),
            productCode,
            productName,
            departmentCode: optionalText(candidate.departmentCode),
            departmentName: optionalText(candidate.departmentName),
            categoryCode: optionalText(candidate.categoryCode),
            categoryName: optionalText(candidate.categoryName),
            subcategory: optionalText(candidate.subcategory),
            isSerialized: candidate.isSerialized === true,
            quantity: Number(quantity.toFixed(3)),
            requestedUnitOfMeasure,
            requestedUnitQuantity: Number(requestedUnitQuantity.toFixed(3)),
            uomConversionFactor: Number(
              finiteNumber(candidate.uomConversionFactor, 1).toFixed(6),
            ),
            baseUnitOfMeasure,
          } satisfies StoreInterStoreTransferRequestDraftLine;
        })
        .filter(
          (
            line,
          ): line is StoreInterStoreTransferRequestDraftLine => line !== null,
        )
        .sort((left, right) => left.lineNo - right.lineNo);

      if (lines.length > 0) {
        return lines;
      }
    }
  } catch {
    // Legacy drafts use the first-line columns below.
  }

  return [fallback];
}

export function writeTransferRequestDraftLines(
  lines: StoreInterStoreTransferRequestDraftLine[],
): string {
  return JSON.stringify(lines);
}
