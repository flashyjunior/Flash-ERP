import { NextResponse } from "next/server";

import { updateEnterpriseBank } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bankCode: string }> }
) {
  const { bankCode } = await params;

  try {
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
      { status: 400 }
    );
  }
}
