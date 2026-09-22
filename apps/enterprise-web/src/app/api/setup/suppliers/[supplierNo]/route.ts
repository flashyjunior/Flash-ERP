import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseSupplier } from "@/server/repositories/enterprise-suppliers.repository";

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      supplierNo: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.supplier.manage"]);
    const { supplierNo } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      addressLine1?: string | null;
      city?: string | null;
      countryCode?: string | null;
      leadTimeDays?: number | null;
      status?: string;
    };

    const response = await updateEnterpriseSupplier(supplierNo, {
      supplierNo,
      name: body.name ?? "",
      contactName: body.contactName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      addressLine1: body.addressLine1 ?? null,
      city: body.city ?? null,
      countryCode: body.countryCode ?? null,
      leadTimeDays: typeof body.leadTimeDays === "number" ? body.leadTimeDays : null,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not update that supplier."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
