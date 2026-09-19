import { NextResponse } from "next/server";

import { assertEnterprisePermission, getEnterpriseSession, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { prisma } from "@/lib/db/prisma";
import { actionExpenseClaim, upsertExpenseClaim } from "@/server/repositories/erp-employee-finance.repository";


export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const employee = await prisma.erpEmployee.findFirst({ where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" }, select: { id: true } });
    if (!employee) throw new EnterpriseAuthError("Your login must be linked to an active employee.", 403);
    const claims = await prisma.erpExpenseClaim.findMany({ where: { employeeId: employee.id }, orderBy: { claimDate: "desc" }, take: 20, select: { id: true, claimNo: true, claimDate: true, purpose: true, totalAmount: true, currencyCode: true, status: true, lines: { select: { category: true, evidenceUrl: true } } } });
    return NextResponse.json({ claims: claims.map((claim) => ({ id: claim.id, claimNo: claim.claimNo, claimDate: claim.claimDate.toISOString().slice(0, 10), purpose: claim.purpose, totalAmount: Number(claim.totalAmount), currencyCode: claim.currencyCode, status: claim.status, category: claim.lines[0]?.category ?? null, evidenceUrl: claim.lines[0]?.evidenceUrl ?? null })) });
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not load expense claims." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const body = await request.json();
    const employee = await prisma.erpEmployee.findFirst({ where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" }, select: { id: true } });
    const canManage = !session.isOnlineStoreUser && session.permissionCodes.includes("hr.employee-finance.manage");
    if (!employee && !canManage) throw new EnterpriseAuthError("Your login must be linked to an active employee.", 403);
    if (employee && body.title && body.amount) {
      const saved = await upsertExpenseClaim({ employeeId: employee.id, claimDate: body.expenseDate, purpose: body.title, lines: [{ expenseDate: body.expenseDate, category: body.category, description: body.note || body.title, expenseAccountCode: body.expenseAccountCode || "6000", amount: body.amount, evidenceUrl: body.receiptUrl }] }, session.displayName);
      const submitted = await actionExpenseClaim({ expenseClaimId: saved.id, action: "SUBMIT" }, session.displayName);
      return NextResponse.json({ ...saved, submitted });
    }
    await assertEnterprisePermission(["hr.employee-finance.manage"]);
    return NextResponse.json(await upsertExpenseClaim(body, session.displayName));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not save the expense claim." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}
