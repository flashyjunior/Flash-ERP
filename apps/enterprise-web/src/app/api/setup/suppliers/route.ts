import { NextResponse } from "next/server";

import { assertEnterprisePermission } from "@/server/auth/enterprise-session";
import { createEnterpriseSupplier } from "@/server/repositories/enterprise-suppliers.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.supplier.manage"]);
    const body = (await request.json()) as {
      supplierNo?: string;
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

    const response = await createEnterpriseSupplier({
      supplierNo: body.supplierNo ?? "",
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
          error instanceof Error ? error.message : "Flash ERP could not create that supplier."
      },
      {
        status: 400
      }
    );
  }
}
