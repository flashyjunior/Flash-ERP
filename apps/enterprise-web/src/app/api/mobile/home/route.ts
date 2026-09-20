import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

/**
 * Home feed for the mobile companion: organisation-level, shop-independent
 * information (upcoming birthdays, the operator's own leave and attendance,
 * pending approvals). Designed so operators without a home shop still get an
 * informative first screen instead of an empty dashboard.
 */
export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);

    const now = new Date();
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);

    // Upcoming birthdays across the organisation in the next 14 days.
    const employees = await prisma.erpEmployee.findMany({
      where: { retailOrgId: session.retailOrgId, status: "ACTIVE", dateOfBirth: { not: null } },
      select: { id: true, displayName: true, dateOfBirth: true, department: { select: { name: true } }, position: { select: { title: true } } },
      take: 500
    });
    const birthdays: Array<{ displayName: string; department: string | null; position: string | null; turns: number; daysUntil: number; dateLabel: string }> = [];
    for (const employee of employees) {
      if (!employee.dateOfBirth) continue;
      const dob = new Date(employee.dateOfBirth);
      if (!Number.isFinite(dob.getTime())) continue;
      // Compare month/day over the next 14 days in UTC.
      for (let offset = 0; offset < 14; offset += 1) {
        const day = new Date(today.getTime() + offset * 24 * 60 * 60 * 1000);
        if (day.getUTCMonth() === dob.getUTCMonth() && day.getUTCDate() === dob.getUTCDate()) {
          birthdays.push({
            displayName: employee.displayName,
            department: employee.department?.name ?? null,
            position: employee.position?.title ?? null,
            turns: day.getUTCFullYear() - dob.getUTCFullYear(),
            daysUntil: offset,
            dateLabel: day.toISOString().slice(0, 10)
          });
          break;
        }
      }
    }
    birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

    // The signed-in operator's own HR context (best effort; not everyone is an employee).
    const ownEmployee = await prisma.erpEmployee.findFirst({
      where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" },
      select: { id: true, displayName: true }
    });

    let attendance: { checkInAt: string | null; checkOutAt: string | null; attendanceStatus: string } | null = null;
    let upcomingLeave: Array<{ requestNo: string; leaveTypeName: string; startDate: string; endDate: string; requestedDays: number; status: string }> = [];
    let recentClaims: Array<{ claimNo: string; purpose: string; totalAmount: number; currencyCode: string; status: string }> = [];
    if (ownEmployee) {
      const [attendanceRow, leaveRows, claimRows] = await Promise.all([
        prisma.erpEmployeeAttendance.findFirst({
          where: { retailOrgId: session.retailOrgId, employeeId: ownEmployee.id, workDate: today },
          select: { checkInAt: true, checkOutAt: true, attendanceStatus: true }
        }),
        prisma.erpLeaveRequest.findMany({
          where: { retailOrgId: session.retailOrgId, employeeId: ownEmployee.id, status: { in: ["SUBMITTED", "APPROVED"] }, endDate: { gte: today } },
          orderBy: { startDate: "asc" },
          take: 3,
          select: {
            requestNo: true,
            startDate: true,
            endDate: true,
            requestedDays: true,
            status: true,
            leaveType: { select: { name: true } }
          }
        }),
        prisma.erpExpenseClaim.findMany({
          where: { retailOrgId: session.retailOrgId, employeeId: ownEmployee.id },
          orderBy: { claimDate: "desc" },
          take: 3,
          select: { claimNo: true, purpose: true, totalAmount: true, currencyCode: true, status: true }
        })
      ]);
      attendance = attendanceRow
        ? { checkInAt: attendanceRow.checkInAt?.toISOString() ?? null, checkOutAt: attendanceRow.checkOutAt?.toISOString() ?? null, attendanceStatus: attendanceRow.attendanceStatus }
        : null;
      upcomingLeave = leaveRows.map((row) => ({
        requestNo: row.requestNo,
        leaveTypeName: row.leaveType?.name ?? "Leave",
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        requestedDays: Number(row.requestedDays),
        status: row.status
      }));
      recentClaims = claimRows.map((row) => ({
        claimNo: row.claimNo,
        purpose: row.purpose,
        totalAmount: Number(row.totalAmount),
        currencyCode: row.currencyCode,
        status: row.status
      }));
    }

    const pendingApprovals = session.permissionCodes.some((code) => code.includes("approve"))
      ? await prisma.erpLeaveRequest.count({ where: { retailOrgId: session.retailOrgId, status: "SUBMITTED" } })
      : 0;

    return NextResponse.json({
      birthdays: birthdays.slice(0, 5),
      attendance,
      upcomingLeave,
      recentClaims,
      pendingApprovals,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not load your home feed." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
