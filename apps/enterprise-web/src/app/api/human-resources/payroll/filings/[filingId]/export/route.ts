import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";
import { buildPayrollFilingCsv } from "@/server/repositories/erp-payroll.repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filingId: string }> }
) {
  try {
    await assertEnterprisePermission(["hr.payroll.file"]);
    const { filingId } = await params;
    const output = await buildPayrollFilingCsv(filingId);
    if (!output) throw new Error("Flash ERP could not find that payroll filing schedule.");
    return new Response(output.csv, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${output.fileName}"`,
        "Content-Type": "text/csv; charset=utf-8"
      }
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not export the payroll filing." },
      { status: error instanceof EnterpriseAuthError ? error.status : 404 }
    );
  }
}
