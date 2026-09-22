import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { createEnterpriseProductDepartment } from "@/server/repositories/enterprise-setup.repository";

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["master.department.manage"]);
    const body = (await request.json()) as {
      departmentCode?: string;
      name?: string;
      description?: string | null;
      sortOrder?: number | null;
      status?: string;
    };

    const response = await createEnterpriseProductDepartment({
      departmentCode: body.departmentCode ?? "",
      name: body.name ?? "",
      description: body.description ?? null,
      sortOrder: body.sortOrder ?? 0,
      status: body.status ?? "ACTIVE"
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error ? error.message : "Flash ERP could not create that department."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
