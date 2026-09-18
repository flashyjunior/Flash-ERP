import { NextResponse } from "next/server";

import type {
  StoreMasterDataPublicationRequest,
  StoreMasterDataPublicationScope,
} from "@flash-erp/sync-core";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { publishStoreMasterData } from "@/server/repositories/store-sync.repository";

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

function parseRequest(value: unknown): StoreMasterDataPublicationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Flash ERP expected a master-data publication request.");
  }

  const body = value as Record<string, unknown>;
  const scopes = Array.isArray(body.scopes)
    ? body.scopes.filter(
        (scope): scope is StoreMasterDataPublicationScope =>
          typeof scope === "string" &&
          supportedScopes.has(scope as StoreMasterDataPublicationScope),
      )
    : [];

  return {
    scopes,
    note: typeof body.note === "string" ? body.note : undefined,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ nodeCode: string }> },
) {
  try {
    const session = await assertEnterprisePermission(["sync.admin.reseed"]);
    const { nodeCode } = await params;
    const input = parseRequest(await request.json());
    const result = await publishStoreMasterData(
      decodeURIComponent(nodeCode),
      {
        ...input,
        operatorName: session.displayName || session.loginId,
      },
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Flash ERP could not queue the selected master data.",
      },
      { status: 400 },
    );
  }
}
