import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";

interface LeaveQueueRow {
  id: string;
  requestNo: string;
  startDate: Date;
  endDate: Date;
  requestedDays: number | { toString(): string };
  reason: string | null;
  status: string;
  requestDate: Date;
  employee: { displayName: string; employeeNo: string };
  leaveType: { name: string };
}

interface ExpenseQueueRow {
  id: string;
  claimNo: string;
  claimDate: Date;
  purpose: string;
  totalAmount: number | { toString(): string };
  currencyCode: string;
  status: string;
  submittedAt: Date | null;
  employee: { displayName: string; employeeNo: string };
  _count: { lines: number };
}

export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const codes = session.permissionCodes ?? [];
    const canApproveLeave =
      codes.includes("hr.leave.manage") || codes.some((code) => code.includes("approve"));
    const canApproveExpenses =
      codes.includes("hr.employee-finance.approve") ||
      codes.includes("hr.employee-finance.manage") ||
      codes.some((code) => code.includes("approve"));
    if (!canApproveLeave && !canApproveExpenses) {
      throw new EnterpriseAuthError(
        "Flash ERP requires approval privileges before reviewing leave or expense claims.",
        403
      );
    }

    // take: 0 keeps the query fully typed while returning nothing for queues
    // the caller is not permitted to decide.
    const [leave, expenses]: [LeaveQueueRow[], ExpenseQueueRow[]] = await Promise.all([
      prisma.erpLeaveRequest.findMany({
        where: { retailOrgId: session.retailOrgId, status: "SUBMITTED" },
        orderBy: { requestDate: "desc" },
        take: canApproveLeave ? 50 : 0,
        select: {
          id: true,
          requestNo: true,
          startDate: true,
          endDate: true,
          requestedDays: true,
          reason: true,
          status: true,
          requestDate: true,
          employee: { select: { displayName: true, employeeNo: true } },
          leaveType: { select: { name: true } }
        }
      }),
      prisma.erpExpenseClaim.findMany({
        where: { retailOrgId: session.retailOrgId, status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        take: canApproveExpenses ? 50 : 0,
        select: {
          id: true,
          claimNo: true,
          claimDate: true,
          purpose: true,
          totalAmount: true,
          currencyCode: true,
          status: true,
          submittedAt: true,
          employee: { select: { displayName: true, employeeNo: true } },
          _count: { select: { lines: true } }
        }
      })
    ]);

    return NextResponse.json({
      leave: leave.map((row) => ({
        id: row.id,
        requestNo: row.requestNo,
        employeeName: row.employee.displayName,
        employeeNo: row.employee.employeeNo,
        leaveTypeName: row.leaveType.name,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        requestedDays: Number(row.requestedDays),
        reason: row.reason,
        status: row.status,
        submittedAt: row.requestDate.toISOString()
      })),
      expenses: expenses.map((row) => ({
        id: row.id,
        claimNo: row.claimNo,
        employeeName: row.employee.displayName,
        employeeNo: row.employee.employeeNo,
        claimDate: row.claimDate.toISOString().slice(0, 10),
        purpose: row.purpose,
        totalAmount: Number(row.totalAmount),
        currencyCode: row.currencyCode,
        status: row.status,
        lineCount: row._count.lines,
        submittedAt: row.submittedAt?.toISOString() ?? null
      })),
      pendingCount: leave.length + expenses.length,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not load pending approvals." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
