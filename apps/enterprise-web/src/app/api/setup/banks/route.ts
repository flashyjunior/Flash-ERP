import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseBank } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.bank.manage"]);
    const payload = (await request.json()) as {
      bankCode?: string;
      name?: string;
      description?: string | null;
      status?: string | null;
    };
    const response = await createEnterpriseBank({
      bankCode: payload.bankCode ?? "",
      name: payload.name ?? "",
      description: payload.description ?? null,
      status: payload.status ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not create that bank."
      },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
