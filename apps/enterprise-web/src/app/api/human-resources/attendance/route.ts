import { NextResponse } from "next/server";

import { assertEnterprisePermission, getEnterpriseSession, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { prisma } from "@/lib/db/prisma";
import {
  getErpAttendanceBatch,
  saveErpEmployeeAttendanceBatch,
  upsertErpEmployeeAttendance
} from "@/server/repositories/erp-hr-attendance.repository";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("self") === "true") {
      const session = await getEnterpriseSession();
      if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
      const employee = await prisma.erpEmployee.findFirst({
        where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" },
        select: { id: true }
      });
      if (!employee) throw new EnterpriseAuthError("Your login is not linked to an active employee.", 403);
      const today = new Date(); today.setUTCHours(0, 0, 0, 0);
      const attendance = await prisma.erpEmployeeAttendance.findFirst({
        where: { retailOrgId: session.retailOrgId, employeeId: employee.id, workDate: today },
        select: { checkInAt: true, checkOutAt: true, attendanceStatus: true }
      });
      return NextResponse.json({ attendance: attendance ? {
        checkInAt: attendance.checkInAt?.toISOString() ?? null,
        checkOutAt: attendance.checkOutAt?.toISOString() ?? null,
        attendanceStatus: attendance.attendanceStatus
      } : null });
    }
    await assertEnterprisePermission(["hr.view"]);
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
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const body = await request.json();
    const linkedEmployee = await prisma.erpEmployee.findFirst({
      where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" },
      select: { id: true }
    });
    const canManage = !session.isOnlineStoreUser && session.permissionCodes.includes("hr.attendance.manage");
    if (!linkedEmployee && !canManage) {
      throw new EnterpriseAuthError("Your login must be linked to an active employee before using attendance.", 403);
    }
    const isSelfService = linkedEmployee && !Array.isArray(body?.rows);
    const eventTime = body.checkOutTime ?? body.checkInTime ?? new Date();
    const workDate = new Date(eventTime);
    workDate.setUTCHours(0, 0, 0, 0);
    const existingAttendance = isSelfService && body.checkOutTime ? await prisma.erpEmployeeAttendance.findFirst({
      where: { retailOrgId: session.retailOrgId, employeeId: linkedEmployee.id, workDate },
      select: { checkInAt: true }
    }) : null;
    if (isSelfService && body.checkOutTime && !existingAttendance?.checkInAt) {
      throw new Error("Clock in before attempting to clock out.");
    }
    const selfServiceBody = isSelfService ? {
      employeeId: linkedEmployee.id,
      workDate,
      attendanceStatus: "PRESENT",
      checkInAt: existingAttendance?.checkInAt ?? body.checkInTime ?? new Date(),
      checkOutAt: body.checkOutTime ?? null,
      note: body.locationNote ?? "Employee mobile self-service"
    } : body;
    const response = Array.isArray(body?.rows)
      ? await saveErpEmployeeAttendanceBatch(body, session.displayName)
      : await upsertErpEmployeeAttendance(selfServiceBody, session.displayName);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save attendance." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
