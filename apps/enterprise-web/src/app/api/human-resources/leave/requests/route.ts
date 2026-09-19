import { NextResponse } from "next/server";

import { getEnterpriseSession, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { prisma } from "@/lib/db/prisma";
import { createErpLeaveRequest, decideErpLeaveRequest } from "@/server/repositories/erp-hr-leave.repository";


export async function GET() {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const employee = await prisma.erpEmployee.findFirst({
      where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" },
      select: { id: true, companyId: true }
    });
    if (!employee) throw new EnterpriseAuthError("Your login must be linked to an active employee before viewing leave.", 403);
    const year = new Date().getUTCFullYear();
    const [types, entitlements, requests, documents] = await Promise.all([
      prisma.erpLeaveType.findMany({ where: { companyId: employee.companyId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true, isPaid: true, requiresAttachment: true, defaultDays: true } }),
      prisma.erpEmployeeLeaveEntitlement.findMany({ where: { employeeId: employee.id, leaveYear: year, status: "ACTIVE" }, select: { leaveTypeId: true, openingDays: true, allocatedDays: true, adjustedDays: true, usedDays: true, pendingDays: true } }),
      prisma.erpLeaveRequest.findMany({ where: { employeeId: employee.id }, orderBy: { requestDate: "desc" }, take: 20, select: { id: true, requestNo: true, startDate: true, endDate: true, requestedDays: true, reason: true, status: true, leaveType: { select: { name: true } } } }),
      prisma.erpHrDocument.findMany({ where: { employeeId: employee.id, documentType: "LEAVE_SUPPORT", status: "ACTIVE", deletedAt: null }, select: { note: true, externalUrl: true } })
    ]);
    const entitlementByType = new Map(entitlements.map((row) => [row.leaveTypeId, row]));
    return NextResponse.json({ year, leaveTypes: types.map((type) => {
      const balance = entitlementByType.get(type.id);
      const availableDays = balance ? Number(balance.openingDays) + Number(balance.allocatedDays) + Number(balance.adjustedDays) - Number(balance.usedDays) - Number(balance.pendingDays) : Number(type.defaultDays);
      return { id: type.id, code: type.code, name: type.name, isPaid: type.isPaid, requiresAttachment: type.requiresAttachment, availableDays };
    }), requests: requests.map((row) => ({ id: row.id, requestNo: row.requestNo, leaveTypeName: row.leaveType.name, startDate: row.startDate.toISOString().slice(0, 10), endDate: row.endDate.toISOString().slice(0, 10), requestedDays: Number(row.requestedDays), reason: row.reason, status: row.status, attachmentUrl: documents.find((document) => document.note?.includes(row.requestNo))?.externalUrl ?? null })) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not load your leave workspace." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}


export async function PATCH(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const body = await request.json();
    const employee = await prisma.erpEmployee.findFirst({ where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" }, select: { id: true } });
    if (!employee) throw new EnterpriseAuthError("Your login must be linked to an active employee.", 403);
    const leaveRequest = await prisma.erpLeaveRequest.findFirst({ where: { id: body.leaveRequestId, employeeId: employee.id }, select: { id: true } });
    if (!leaveRequest) throw new EnterpriseAuthError("You can cancel only your own leave application.", 403);
    if (!String(body.reason ?? "").trim()) throw new Error("Enter a cancellation reason.");
    return NextResponse.json(await decideErpLeaveRequest({ leaveRequestId: leaveRequest.id, action: "CANCEL", note: body.reason }, session.displayName));
  } catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not cancel the leave request." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 }); }
}

export async function POST(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const body = await request.json();
    const employee = await prisma.erpEmployee.findFirst({
      where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" },
      select: { id: true, companyId: true }
    });
    const canManage = !session.isOnlineStoreUser && session.permissionCodes.includes("hr.leave.manage");
    if (!employee && !canManage) throw new EnterpriseAuthError("Your login must be linked to an active employee before requesting leave.", 403);
    const leaveType = body.leaveTypeId ? null : await prisma.erpLeaveType.findFirst({
      where: { companyId: employee?.companyId, status: "ACTIVE" },
      orderBy: { code: "asc" }, select: { id: true }
    });
    const selectedLeaveTypeId = body.leaveTypeId || leaveType?.id;
    const configuredType = selectedLeaveTypeId ? await prisma.erpLeaveType.findFirst({ where: { id: selectedLeaveTypeId, companyId: employee?.companyId }, select: { requiresAttachment: true, name: true } }) : null;
    if (configuredType?.requiresAttachment && !String(body.attachmentUrl ?? "").trim()) throw new Error(`${configuredType.name} requires a supporting document.`);
    const response = await createErpLeaveRequest({ ...body, employeeId: employee?.id ?? body.employeeId, leaveTypeId: selectedLeaveTypeId }, session.displayName);
    if (employee && body.attachmentUrl && response.requestNo) {
      await prisma.erpHrDocument.create({ data: { retailOrgId: session.retailOrgId, companyId: employee.companyId, employeeId: employee.id, documentNo: `LEAVE-${response.requestNo}`, documentType: "LEAVE_SUPPORT", title: `${configuredType?.name ?? "Leave"} support - ${response.requestNo}`, fileName: String(body.attachmentFileName || "leave-support.jpg"), mimeType: String(body.attachmentMimeType || "image/jpeg"), externalUrl: String(body.attachmentUrl), note: `Supporting document for leave request ${response.requestNo}`, uploadedBy: session.displayName } });
    }
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not save the leave request." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
