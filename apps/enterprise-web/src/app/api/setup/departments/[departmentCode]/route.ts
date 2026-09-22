import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { updateEnterpriseProductDepartment } from "@/server/repositories/enterprise-setup.repository";

export async function POST(
  request: Request,
  context: {
    params: Promise<{
      departmentCode: string;
    }>;
  }
) {
  try {
    await assertEnterprisePermission(["master.department.manage"]);
    const params = await context.params;
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      sortOrder?: number | null;
      status?: string;
    };

    const response = await updateEnterpriseProductDepartment(params.departmentCode, {
      departmentCode: params.departmentCode,
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
          error instanceof Error ? error.message : "Flash ERP could not update that department."
      },
      {
        status: error instanceof EnterpriseAuthError ? error.status : 400
      }
    );
  }
}
