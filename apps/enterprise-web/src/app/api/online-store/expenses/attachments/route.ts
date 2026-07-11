import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { assertEnterpriseOrOnlineStorePermission } from "@/server/auth/enterprise-session";
import {
  isSupportedStoreExpenseExtension,
  resolveStoreExpenseUploadDir
} from "@/server/files/store-expense-storage";

export const runtime = "nodejs";

const maxUploadBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await assertEnterpriseOrOnlineStorePermission(
      ["finance.cashbook.manage", "finance.journal.post"],
      ["inventory.transfer.request"],
      { any: true }
    );
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("Choose an attachment before uploading the expense evidence.");
    }

    if (file.size <= 0) {
      throw new Error("Flash ERP received an empty attachment.");
    }

    if (file.size > maxUploadBytes) {
      throw new Error("Flash ERP accepts store expense attachments up to 10 MB.");
    }

    const extension = path.extname(file.name).toLowerCase() || ".bin";

    if (!isSupportedStoreExpenseExtension(extension)) {
      throw new Error("Flash ERP supports PDF, PNG, JPG, WEBP, and GIF expense attachments.");
    }

    const uploadDir = resolveStoreExpenseUploadDir();
    const fileName = `${Date.now()}-store-expense-${randomUUID()}${extension}`;
    const outputPath = path.join(uploadDir, fileName);
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    mkdirSync(uploadDir, { recursive: true });
    await writeFile(outputPath, fileBuffer);

    return NextResponse.json({
      url: `/api/online-store/expenses/attachments/${encodeURIComponent(fileName)}`,
      fileName,
      uploadedAt: new Date().toISOString(),
      message: `${file.name} uploaded as store expense evidence.`
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Flash ERP could not upload the store expense attachment."
      },
      { status: 400 }
    );
  }
}
