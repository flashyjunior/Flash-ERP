import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { assertEnterprisePermission, EnterpriseAuthError } from "@/server/auth/enterprise-session";

export const runtime = "nodejs";

const maxUploadBytes = 15 * 1024 * 1024;
const supportedMimeTypes = new Map<string, string>([
  ["application/pdf", ".pdf"],
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"]
]);
const supportedExtensions = new Set([".pdf", ".jpg", ".jpeg", ".png", ".webp", ".doc", ".docx"]);

function resolveEnterpriseWebRoot() {
  const candidates = [process.cwd(), path.join(process.cwd(), "apps", "enterprise-web")];
  return candidates.find((candidate) => existsSync(path.join(candidate, "next.config.ts"))) ?? candidates[0];
}

function resolveExtension(file: File) {
  const mimeExtension = supportedMimeTypes.get(file.type);
  if (mimeExtension) return mimeExtension;
  const extension = path.extname(file.name).toLowerCase();
  return supportedExtensions.has(extension) ? extension : null;
}

export async function POST(request: Request) {
  try {
    await assertEnterprisePermission(["hr.document.manage"]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Flash ERP needs a file before uploading an HR document.");
    if (file.size <= 0) throw new Error("Flash ERP received an empty HR document file.");
    if (file.size > maxUploadBytes) throw new Error("Flash ERP HR documents cannot exceed 15 MB.");
    const extension = resolveExtension(file);
    if (!extension) {
      throw new Error("Flash ERP accepts PDF, PNG, JPG, WEBP, DOC, and DOCX HR documents only.");
    }

    const now = new Date();
    const relativeDirectory = path.join(
      "hr-documents",
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0")
    );
    const fileName = `${Date.now()}-${randomUUID()}${extension}`;
    const storageKey = path.join(relativeDirectory, fileName).replace(/\\/g, "/");
    const storageRoot = path.join(resolveEnterpriseWebRoot(), "storage");
    const outputPath = path.join(storageRoot, storageKey);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      storageKey,
      fileName: file.name,
      mimeType: file.type || null,
      fileSizeBytes: file.size,
      message: `${file.name} uploaded into protected HR document storage.`
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Flash ERP could not upload the HR document." },
      { status: error instanceof EnterpriseAuthError ? error.status : 400 }
    );
  }
}
