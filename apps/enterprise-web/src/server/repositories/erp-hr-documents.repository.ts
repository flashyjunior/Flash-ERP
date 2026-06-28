import { prisma } from "@/lib/db/prisma";
import { reserveHrDocumentNumber } from "@/server/repositories/erp-hr-numbering";
import {
  activeStatus,
  dateInputValue,
  getHrContext,
  getPrimaryHrCompany,
  normalizeChoice,
  normalizeOptionalDate,
  normalizeOptionalText,
  normalizeRequiredText
} from "@/server/repositories/erp-hr-shared";

const documentTypes = [
  "EMPLOYMENT_LETTER",
  "CONTRACT",
  "ID_DOCUMENT",
  "CERTIFICATE",
  "WARNING_LETTER",
  "APPRAISAL",
  "OTHER"
] as const;

export type UpsertErpHrDocumentRequest = {
  documentId?: string | null;
  employeeId?: string | null;
  documentType?: string | null;
  title?: string | null;
  referenceNo?: string | null;
  issueDate?: string | Date | null;
  expiryDate?: string | Date | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | string | null;
  storageKey?: string | null;
  externalUrl?: string | null;
  note?: string | null;
};

export type ErpHrDocumentMutationResponse = {
  message: string;
  documentId: string;
  documentNo: string;
  serverProcessedAt: string;
};

export type ErpHrDocumentsWorkspaceData = {
  companyName: string;
  statusMessage: string;
  refreshedAt: string;
  documentTypeOptions: Array<{ value: string; label: string }>;
  employeeOptions: Array<{
    employeeId: string;
    employeeNo: string;
    displayName: string;
    departmentName: string;
    status: string;
  }>;
  documentRows: Array<{
    documentId: string;
    documentNo: string;
    employeeId: string;
    employeeNo: string;
    employeeName: string;
    departmentName: string;
    documentType: string;
    title: string;
    referenceNo: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    fileName: string;
    mimeType: string | null;
    fileSizeBytes: number | null;
    fileUrl: string | null;
    externalUrl: string | null;
    note: string | null;
    status: string;
    uploadedBy: string;
    uploadedAt: string;
    deletedBy: string | null;
    deletedAt: string | null;
  }>;
  metrics: {
    activeDocuments: number;
    expiringWithin30Days: number;
    expiredDocuments: number;
    employeesWithDocuments: number;
  };
};

function documentTypeLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildUnavailableErpHrDocumentsWorkspace(
  reason: string
): ErpHrDocumentsWorkspaceData {
  return {
    companyName: "Flash ERP",
    statusMessage: reason,
    refreshedAt: new Date().toISOString(),
    documentTypeOptions: documentTypes.map((value) => ({ value, label: documentTypeLabel(value) })),
    employeeOptions: [],
    documentRows: [],
    metrics: {
      activeDocuments: 0,
      expiringWithin30Days: 0,
      expiredDocuments: 0,
      employeesWithDocuments: 0
    }
  };
}

export async function getErpHrDocumentsWorkspace(): Promise<ErpHrDocumentsWorkspaceData> {
  const context = await getHrContext();
  if (!context) {
    return buildUnavailableErpHrDocumentsWorkspace(
      "Flash ERP enterprise organization is not configured yet."
    );
  }
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) {
    return buildUnavailableErpHrDocumentsWorkspace(
      "Create a company before maintaining employee documents."
    );
  }

  const [employees, documents] = await Promise.all([
    prisma.erpEmployee.findMany({
      where: { companyId: company.id, status: { not: "DELETED" } },
      orderBy: [{ status: "asc" }, { displayName: "asc" }],
      include: { department: true }
    }),
    prisma.erpHrDocument.findMany({
      where: { companyId: company.id },
      orderBy: [{ uploadedAt: "desc" }, { documentNo: "desc" }],
      include: { employee: { include: { department: true } } }
    })
  ]);

  const now = new Date();
  const expiryCutoff = new Date(now);
  expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() + 30);
  const activeDocuments = documents.filter((document) => document.status === activeStatus);

  return {
    companyName: company.tradingName ?? company.legalName,
    statusMessage: `Protected employee documents for ${company.tradingName ?? company.legalName}.`,
    refreshedAt: new Date().toISOString(),
    documentTypeOptions: documentTypes.map((value) => ({ value, label: documentTypeLabel(value) })),
    employeeOptions: employees.map((employee) => ({
      employeeId: employee.id,
      employeeNo: employee.employeeNo,
      displayName: employee.displayName,
      departmentName: employee.department.name,
      status: employee.status
    })),
    documentRows: documents.map((document) => ({
      documentId: document.id,
      documentNo: document.documentNo,
      employeeId: document.employeeId,
      employeeNo: document.employee.employeeNo,
      employeeName: document.employee.displayName,
      departmentName: document.employee.department.name,
      documentType: document.documentType,
      title: document.title,
      referenceNo: document.referenceNo,
      issueDate: dateInputValue(document.issueDate),
      expiryDate: dateInputValue(document.expiryDate),
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      fileUrl:
        document.status === activeStatus
          ? document.storageKey
            ? `/api/human-resources/documents/${document.id}/file`
            : document.externalUrl
          : null,
      externalUrl: document.externalUrl,
      note: document.note,
      status: document.status,
      uploadedBy: document.uploadedBy,
      uploadedAt: document.uploadedAt.toISOString(),
      deletedBy: document.deletedBy,
      deletedAt: document.deletedAt?.toISOString() ?? null
    })),
    metrics: {
      activeDocuments: activeDocuments.length,
      expiringWithin30Days: activeDocuments.filter(
        (document) => document.expiryDate && document.expiryDate >= now && document.expiryDate <= expiryCutoff
      ).length,
      expiredDocuments: activeDocuments.filter(
        (document) => document.expiryDate && document.expiryDate < now
      ).length,
      employeesWithDocuments: new Set(activeDocuments.map((document) => document.employeeId)).size
    }
  };
}

export async function upsertErpHrDocument(
  input: UpsertErpHrDocumentRequest,
  actor: string
): Promise<ErpHrDocumentMutationResponse> {
  return prisma.$transaction(async (tx) => {
    const context = await getHrContext(tx);
    if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
    const company = await getPrimaryHrCompany(tx, context);
    if (!company) throw new Error("Create a company before maintaining employee documents.");

    const documentId = normalizeOptionalText(input.documentId);
    const existing = documentId
      ? await tx.erpHrDocument.findFirst({ where: { id: documentId, companyId: company.id } })
      : null;
    if (documentId && !existing) throw new Error("Flash ERP could not find the HR document.");
    if (existing?.status === "DELETED") throw new Error("Deleted HR documents cannot be edited.");

    const employeeId = normalizeRequiredText(input.employeeId, "employee");
    const employee = await tx.erpEmployee.findFirst({
      where: { id: employeeId, companyId: company.id, status: { not: "DELETED" } }
    });
    if (!employee) throw new Error("Flash ERP could not find the selected employee.");

    const documentType = normalizeChoice(
      input.documentType,
      "document type",
      [...documentTypes]
    );
    const issueDate = normalizeOptionalDate(input.issueDate, "issue date");
    const expiryDate = normalizeOptionalDate(input.expiryDate, "expiry date");
    if (issueDate && expiryDate && expiryDate < issueDate) {
      throw new Error("Flash ERP document expiry date cannot precede its issue date.");
    }

    const storageKey = normalizeOptionalText(input.storageKey) ?? existing?.storageKey ?? null;
    const externalUrl = normalizeOptionalText(input.externalUrl) ?? existing?.externalUrl ?? null;
    if (!storageKey && !externalUrl) {
      throw new Error("Flash ERP needs an uploaded file or external document link.");
    }
    if (storageKey && !storageKey.startsWith("hr-documents/")) {
      throw new Error("Flash ERP received an invalid protected HR document storage key.");
    }
    if (externalUrl && !/^https?:\/\//i.test(externalUrl)) {
      throw new Error("Flash ERP external document links must start with http:// or https://.");
    }

    const fileSizeBytes = Number(input.fileSizeBytes ?? existing?.fileSizeBytes ?? 0);
    if (!Number.isFinite(fileSizeBytes) || fileSizeBytes < 0 || fileSizeBytes > 15 * 1024 * 1024) {
      throw new Error("Flash ERP HR documents cannot exceed 15 MB.");
    }

    let documentNo = existing?.documentNo ?? null;
    if (!documentNo) {
      documentNo = (
        await reserveHrDocumentNumber(tx, {
          context,
          company,
          documentType: "HR_DOCUMENT",
          prefix: "HRD"
        })
      ).documentNo;
    }

    const data = {
      employeeId,
      documentType,
      title: normalizeRequiredText(input.title, "document title"),
      referenceNo: normalizeOptionalText(input.referenceNo),
      issueDate,
      expiryDate,
      fileName:
        normalizeOptionalText(input.fileName) ?? existing?.fileName ?? "Linked document",
      mimeType: normalizeOptionalText(input.mimeType) ?? existing?.mimeType ?? null,
      fileSizeBytes: fileSizeBytes || null,
      storageKey,
      externalUrl,
      note: normalizeOptionalText(input.note),
      uploadedBy: actor,
      uploadedAt: new Date()
    };

    const document = existing
      ? await tx.erpHrDocument.update({ where: { id: existing.id }, data })
      : await tx.erpHrDocument.create({
          data: {
            retailOrgId: context.retailOrgId,
            companyId: company.id,
            documentNo,
            status: activeStatus,
            ...data
          }
        });

    return {
      message: `Flash ERP saved employee document ${document.documentNo}.`,
      documentId: document.id,
      documentNo: document.documentNo,
      serverProcessedAt: new Date().toISOString()
    };
  });
}

export async function deleteErpHrDocument(documentId: string, actor: string) {
  const context = await getHrContext();
  if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) throw new Error("Create a company before maintaining employee documents.");
  const document = await prisma.erpHrDocument.findFirst({
    where: { id: normalizeRequiredText(documentId, "document"), companyId: company.id }
  });
  if (!document) throw new Error("Flash ERP could not find the HR document.");
  if (document.status !== "DELETED") {
    await prisma.erpHrDocument.update({
      where: { id: document.id },
      data: { status: "DELETED", deletedBy: actor, deletedAt: new Date() }
    });
  }
  return {
    message: `Flash ERP archived employee document ${document.documentNo}.`,
    documentId: document.id,
    documentNo: document.documentNo,
    serverProcessedAt: new Date().toISOString()
  };
}

export async function getErpHrDocumentFile(documentId: string) {
  const context = await getHrContext();
  if (!context) throw new Error("Flash ERP enterprise organization is not configured yet.");
  const company = await getPrimaryHrCompany(prisma, context);
  if (!company) throw new Error("Create a company before opening employee documents.");
  const document = await prisma.erpHrDocument.findFirst({
    where: {
      id: normalizeRequiredText(documentId, "document"),
      companyId: company.id,
      status: activeStatus
    },
    select: { storageKey: true, fileName: true, mimeType: true }
  });
  if (!document?.storageKey) throw new Error("Flash ERP could not find the protected document file.");
  return {
    storageKey: document.storageKey,
    fileName: document.fileName,
    mimeType: document.mimeType
  };
}
