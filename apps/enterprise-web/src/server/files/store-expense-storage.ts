import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveEnterpriseWebRoot } from "@/server/files/fuel-evidence-storage";

const contentTypes = new Map<string, string>([
  [".gif", "image/gif"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

export function resolveStoreExpenseUploadDir() {
  return path.join(resolveEnterpriseWebRoot(), "public", "uploads", "store-expenses");
}

export function normalizeStoreExpenseFileName(fileName: string) {
  return path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "");
}

export function getStoreExpenseContentType(fileName: string) {
  return contentTypes.get(path.extname(fileName).toLowerCase()) ?? "application/octet-stream";
}

export function isSupportedStoreExpenseExtension(extension: string) {
  return contentTypes.has(extension.toLowerCase());
}

export async function readStoreExpenseFile(fileName: string) {
  const normalizedFileName = normalizeStoreExpenseFileName(fileName);

  if (!normalizedFileName) {
    return null;
  }

  const filePath = path.join(resolveStoreExpenseUploadDir(), normalizedFileName);

  if (!existsSync(filePath)) {
    return null;
  }

  const file = await readFile(filePath);

  return {
    file,
    fileName: normalizedFileName,
    contentType: getStoreExpenseContentType(normalizedFileName)
  };
}

export async function writeStoreExpenseAttachment(input: {
  fileName: string;
  content: Buffer;
}) {
  const normalizedFileName = normalizeStoreExpenseFileName(input.fileName);
  const extension = path.extname(normalizedFileName).toLowerCase();

  if (!normalizedFileName || !isSupportedStoreExpenseExtension(extension)) {
    throw new Error("Flash ERP supports PDF, PNG, JPG, WEBP, and GIF expense attachments.");
  }

  if (input.content.byteLength > 10 * 1024 * 1024) {
    throw new Error("Flash ERP accepts store expense attachments up to 10 MB.");
  }

  const uploadDir = resolveStoreExpenseUploadDir();
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, normalizedFileName), input.content);

  return {
    fileName: normalizedFileName,
    url: `/api/online-store/expenses/attachments/${encodeURIComponent(normalizedFileName)}`
  };
}
