import { NextResponse } from "next/server";

import type {
  StoreMasterDataDistributionRequest,
  StoreMasterDataPublicationScope,
} from "@flash-erp/sync-core";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { publishStoreMasterDataToNodes } from "@/server/repositories/store-sync.repository";

const supportedScopes = new Set<StoreMasterDataPublicationScope>([
  "STORE_SETUP",
  "SECURITY",
  "CUSTOMERS",
  "SUPPLIERS",
  "PRODUCTS",
  "PRICING",
  "TAX_AND_TENDERS",
  "PROMOTIONS",
  "BANKING",
  "GIFT_CERTIFICATES",
]);

function parseRequest(value: unknown): StoreMasterDataDistributionRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Flash ERP expected a master-data distribution request.");
  }

  const body = value as Record<string, unknown>;
  const nodeCodes = Array.isArray(body.nodeCodes)
    ? body.nodeCodes.filter((nodeCode): nodeCode is string => typeof nodeCode === "string")
    : [];
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter(
        (scope): scope is StoreMasterDataPublicationScope =>
          typeof scope === "string" &&
          supportedScopes.has(scope as StoreMasterDataPublicationScope),
      )
    : [];

  return {
    nodeCodes,
    scopes,
    note: typeof body.note === "string" ? body.note : undefined,
  };
}

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["sync.admin.reseed"]);
    const input = parseRequest(await request.json());
    const response = await publishStoreMasterDataToNodes(input.nodeCodes, {
      scopes: input.scopes,
      note: input.note,
      operatorName: session.displayName || session.loginId,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue the selected master data.",
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 },
    );
  }
}
