import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { updateEnterpriseBankAccount } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      bankAccountId: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.bank.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      bankCode?: string;
      bankName?: string;
      branchCode?: string;
      branchName?: string;
      addressLine1?: string | null;
      accountNumber?: string;
      accountName?: string;
      currencyCode?: string | null;
      status?: string;
    };

    const response = await updateEnterpriseBankAccount(params.bankAccountId, {
      bankCode: body.bankCode ?? "",
      bankName: body.bankName ?? "",
      branchCode: body.branchCode ?? "",
      branchName: body.branchName ?? "",
      addressLine1: body.addressLine1 ?? null,
      accountNumber: body.accountNumber ?? "",
      accountName: body.accountName ?? "",
      currencyCode: body.currencyCode ?? null,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not update that bank account."
      },
      {
        status: 400
      }
    );
  }
}
