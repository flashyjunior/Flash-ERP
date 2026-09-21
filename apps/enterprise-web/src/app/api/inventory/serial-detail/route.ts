import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import {
  EnterpriseCapacityError,
  runEnterpriseOperation
} from "@/server/performance/enterprise-runtime-capacity";
import { getEnterpriseInventorySerialDetail } from "@/server/repositories/enterprise-inventory.repository";

/**
 * Serial-unit and batch/expiry detail for one inventory record, read by the
 * inventory workspace when a product row or a shop stock position is opened.
 * Keeping it behind this route means the page payload stays the same size no
 * matter how many serialized items an organisation carries.
 */
export async function GET(request: Request) {
  try {
    await assertEnterprisePermission(["inventory.view"]);

    const url = new URL(request.url);
    const productCode = url.searchParams.get("productCode")?.trim();
    const locationCode = url.searchParams.get("locationCode")?.trim() || null;

    if (!productCode) {
      return NextResponse.json(
        {
          message: "Flash ERP needs a product code before it can read serial and batch detail."
        },
        { status: 400 }
      );
    }

    const detail = await runEnterpriseOperation("AUTHENTICATED_READ", () =>
      getEnterpriseInventorySerialDetail({ productCode, locationCode })
    );

    return NextResponse.json(detail);
  } catch (error) {
    const status =
      error instanceof EnterpriseAuthError || error instanceof EnterpriseCapacityError
        ? error.status
        : 500;

    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not load serial and batch detail."
      },
      { status }
    );
  }
}
