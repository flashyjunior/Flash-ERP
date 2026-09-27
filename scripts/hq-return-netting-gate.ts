import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  signedPosTransactionAmount,
  sumSignedPosTransactionGroups,
} from "../apps/enterprise-web/src/server/repositories/pos-transaction-sign";

const saleAmount = signedPosTransactionAmount("SALE", 6_862);
const returnAmount = signedPosTransactionAmount("RETURN", 6_862);

assert.equal(saleAmount, 6_862);
assert.equal(returnAmount, -6_862);
assert.equal(signedPosTransactionAmount("RETURN", -449), -449);
assert.equal(saleAmount + returnAmount, 0);
assert.equal(
  sumSignedPosTransactionGroups([
    {
      transactionType: "SALE",
      _sum: { totalAmount: 6_862 },
    },
    {
      transactionType: "RETURN",
      _sum: { totalAmount: 6_862 },
    },
  ]),
  0,
);

function requireSourceContract(file: string, snippets: string[]) {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");

  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `${file} must contain ${snippet}`);
  }
}

requireSourceContract(
  "apps/store-desktop/src/main/offline/local-store-service.ts",
  ['event_type, idempotency_key', '"pos.transaction.completed"', "transactionType,"],
);
requireSourceContract(
  "apps/enterprise-web/src/server/repositories/store-sync.repository.ts",
  ['readRequiredString(', '"transactionType"', "transactionType: payload.transactionType"],
);
requireSourceContract(
  "apps/enterprise-web/src/server/repositories/enterprise-pos.repository.ts",
  ['by: ["transactionType"]', "sumSignedPosTransactionGroups(transactionAggregate)", "sourceTransactionNo: transaction.sourceTransactionNo"],
);
requireSourceContract(
  "apps/enterprise-web/src/components/enterprise/enterprise-pos-workspace.tsx",
  ['accessorKey: "transactionType"', 'header: "Type"'],
);
requireSourceContract(
  "apps/enterprise-web/src/server/repositories/enterprise-operations.repository.ts",
  [
    "returnTenderGroups",
    "negativeExchangeTenderGroups",
    "Math.abs(Number(row._sum.amount ?? 0)) * direction",
  ],
);
requireSourceContract(
  "apps/enterprise-web/src/server/repositories/enterprise-reporting.repository.ts",
  ['const direction = line.lineIntent === "RETURN" ? -1 : 1;', "signedPosTransactionAmount("],
);

console.log("HQ sale and return netting acceptance passed.");
