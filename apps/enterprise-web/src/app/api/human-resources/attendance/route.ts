import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import {
  getErpAttendanceBatch,
  saveErpEmployeeAttendanceBatch,
  upsertErpEmployeeAttendance
} from "@/server/repositories/erp-hr-attendance.repository";

export async function GET(request: Request) {
  try {
    await assertEnterprisePermission(["hr.view"]);
    const url = new URL(request.url);
    const response = await getErpAttendanceBatch({
      workDate: url.searchParams.get("workDate"),
      departmentId: url.searchParams.get("departmentId"),
      positionId: url.searchParams.get("positionId"),
      storeId: url.searchParams.get("storeId")
    });
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not load attendance." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await assertEnterprisePermission(["hr.attendance.manage"]);
    const body = await request.json();
    const response = Array.isArray(body?.rows)
      ? await saveErpEmployeeAttendanceBatch(body, session.displayName)
      : await upsertErpEmployeeAttendance(body, session.displayName);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save attendance." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
