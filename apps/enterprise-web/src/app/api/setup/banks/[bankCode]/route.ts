import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseBank } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bankCode: string }> }
) {
  try {
    await assertEnterprisePermission(["master.bank.manage"]);
    const { bankCode } = await params;
    const payload = (await request.json()) as {
      bankCode?: string;
      name?: string;
      description?: string | null;
      status?: string | null;
    };
    const response = await updateEnterpriseBank(bankCode, {
      bankCode: payload.bankCode ?? bankCode,
      name: payload.name ?? "",
      description: payload.description ?? null,
      status: payload.status ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not update that bank."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
