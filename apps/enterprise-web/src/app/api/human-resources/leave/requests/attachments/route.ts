import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { EnterpriseAuthError, getEnterpriseSession } from "@/server/auth/enterprise-session";
import { isSupportedStoreExpenseExtension, resolveStoreExpenseUploadDir } from "@/server/files/store-expense-storage";

export const runtime = "nodejs";
const maxUploadBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const session = await getEnterpriseSession();
    if (!session) throw new EnterpriseAuthError("Flash ERP requires a signed-in session.", 401);
    const employee = await prisma.erpEmployee.findFirst({ where: { retailOrgId: session.retailOrgId, retailUserId: session.userId, status: "ACTIVE" }, select: { id: true } });
    if (!employee) throw new EnterpriseAuthError("Your login must be linked to an active employee.", 403);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) throw new Error("Choose a leave document before uploading.");
    if (file.size > maxUploadBytes) throw new Error("Leave attachments must not exceed 10 MB.");
    const extension = path.extname(file.name).toLowerCase() || ".jpg";
    if (!isSupportedStoreExpenseExtension(extension)) throw new Error("Use a PDF, PNG, JPG, WEBP, or GIF receipt attachment.");
    const directory = resolveStoreExpenseUploadDir();
    const fileName = `${Date.now()}-employee-leave-${randomUUID()}${extension}`;
    mkdirSync(directory, { recursive: true });
    await writeFile(path.join(directory, fileName), Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url: `/api/online-store/expenses/attachments/${encodeURIComponent(fileName)}`, fileName, uploadedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Flash ERP could not upload the leave document." }, { status: error instanceof EnterpriseAuthError ? error.status : 400 });
  }
}
