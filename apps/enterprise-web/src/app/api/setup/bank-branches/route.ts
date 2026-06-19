import { NextResponse } from "next/server";

import { createEnterpriseBankBranch } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      branchCode?: string;
      bankCode?: string;
      name?: string;
      addressLine1?: string | null;
      status?: string | null;
    };
    const response = await createEnterpriseBankBranch({
      branchCode: payload.branchCode ?? "",
      bankCode: payload.bankCode ?? "",
      name: payload.name ?? "",
      addressLine1: payload.addressLine1 ?? null,
      status: payload.status ?? null
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Flash ERP could not create that bank branch."
      },
      { status: 400 }
    );
  }
}
