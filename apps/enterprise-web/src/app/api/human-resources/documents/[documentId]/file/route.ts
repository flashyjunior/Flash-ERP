import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { getErpHrDocumentFile } from "@/server/repositories/erp-hr-documents.repository";

export const runtime = "nodejs";

function resolveEnterpriseWebRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "enterprise-web")];
  return candidates.find((candidate) => existsSync(path.join(candidate, "next.config.ts"))) ?? candidates[0];
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    await assertEnterprisePermission(["hr.document.manage"]);
    const { documentId } = await params;
    const document = await getErpHrDocumentFile(documentId);
    const storageRoot = path.resolve(resolveEnterpriseWebRoot(), "storage");
    const filePath = path.resolve(storageRoot, document.storageKey);
    if (!filePath.startsWith(`${storageRoot}${path.sep}`)) {
      throw new Error("Flash ERP rejected an invalid HR document storage path.");
    }
    const file = await readFile(filePath);
    const safeName = document.fileName.replace(/[\r\n"]/g, "_");
    return new Response(new Uint8Array(file), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Type": document.mimeType || "application/octet-stream",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not open the HR document." },
      { status: error instanceof EnterpriseAuthError ? error.status : 404 }
    );
  }
}
