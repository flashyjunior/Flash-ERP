import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { recordEnterpriseCustomerAccountEntry } from "@/server/repositories/enterprise-customers.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      customerNo: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.customer.manage"]);
    const { customerNo } = await context.params;
    const body = (await request.json()) as {
      entryMode?: "ACCOUNT_PAYMENT" | "RECEIVABLE_ADJUSTMENT" | "LOYALTY_ADJUSTMENT";
      amount?: number | null;
      loyaltyPoints?: number | null;
      tenderMethodCode?: string | null;
      allocations?: Array<{
        invoiceEntryId?: string | null;
        amount?: number | null;
      }>;
      storeCode?: string | null;
      reference?: string | null;
      note?: string | null;
    };

    const response = await recordEnterpriseCustomerAccountEntry(customerNo, {
      entryMode: body.entryMode ?? "ACCOUNT_PAYMENT",
      amount: typeof body.amount === "number" ? body.amount : null,
      loyaltyPoints: typeof body.loyaltyPoints === "number" ? body.loyaltyPoints : null,
      tenderMethodCode: body.tenderMethodCode ?? null,
      allocations: Array.isArray(body.allocations)
        ? body.allocations
            .filter((allocation) => allocation.invoiceEntryId)
            .map((allocation) => ({
              invoiceEntryId: allocation.invoiceEntryId ?? "",
              amount: typeof allocation.amount === "number" ? allocation.amount : null
            }))
        : [],
      storeCode: body.storeCode ?? null,
      reference: body.reference ?? null,
      note: body.note ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not post that customer account activity."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
