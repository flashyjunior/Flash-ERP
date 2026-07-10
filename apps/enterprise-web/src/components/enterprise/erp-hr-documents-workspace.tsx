"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Archive, FileText, Plus, ShieldCheck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ChangeEvent } from "react";

import { GridRowActions, SharedDataGrid } from "@/components/data-grid/data-grid";
import { ActionDialog } from "@/components/dialogs/action-dialog";
import { ConfirmationDialog } from "@/components/dialogs/confirmation-dialog";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrDialogFooter,
  HrFieldInput,
  HrFieldSelect,
  HrFieldTextArea,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  formatHrEnum,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpHrDocumentMutationResponse,
  ErpHrDocumentsWorkspaceData,
  UpsertErpHrDocumentRequest
} from "@/server/repositories/erp-hr-documents.repository";

type DocumentRow = ErpHrDocumentsWorkspaceData["documentRows"][number];

export function ErpHrDocumentsWorkspace({
  workspace,
  initialEmployeeId = ""
}: {
  workspace: ErpHrDocumentsWorkspaceData;
  initialEmployeeId?: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpsertErpHrDocumentRequest>({});
  const [archivingDocument, setArchivingDocument] = useState<DocumentRow | null>(null);
  const [filters, setFilters] = useState({
    employeeId: initialEmployeeId,
    documentType: "",
    status: "ACTIVE",
    expiry: ""
  });
  const [mutationState, setMutationState] = useState<HrMutationState>({
    status: "idle",
    message: ""
  });

  const employeeOptions = useMemo(
    () => [
      { label: "Select employee", value: "" },
      ...workspace.employeeOptions.map((employee) => ({
        label: `${employee.employeeNo} - ${employee.displayName} / ${employee.departmentName}`,
        value: employee.employeeId
      }))
    ],
    [workspace.employeeOptions]
  );
  const typeOptions = useMemo(
    () => [
      { label: "Select document type", value: "" },
      ...workspace.documentTypeOptions
    ],
    [workspace.documentTypeOptions]
  );
  const filteredRows = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() + 30);
    const cutoffText = cutoff.toISOString().slice(0, 10);
    return workspace.documentRows.filter((row) => {
      if (filters.employeeId && row.employeeId !== filters.employeeId) return false;
      if (filters.documentType && row.documentType !== filters.documentType) return false;
      if (filters.status && row.status !== filters.status) return false;
      if (filters.expiry === "EXPIRED" && (!row.expiryDate || row.expiryDate >= today)) return false;
      if (
        filters.expiry === "EXPIRING" &&
        (!row.expiryDate || row.expiryDate < today || row.expiryDate > cutoffText)
      ) {
        return false;
      }
      if (filters.expiry === "NO_EXPIRY" && row.expiryDate) return false;
      return true;
    });
  }, [filters, workspace.documentRows]);

  function startNew() {
    setMutationState({ status: "idle", message: "" });
    setDraft({
      employeeId: initialEmployeeId || workspace.employeeOptions[0]?.employeeId || "",
      documentType: "CONTRACT",
      title: "",
      referenceNo: "",
      issueDate: "",
      expiryDate: "",
      fileName: "",
      mimeType: "",
      fileSizeBytes: 0,
      storageKey: "",
      externalUrl: "",
      note: ""
    });
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMutationState({ status: "submitting", message: `Uploading ${file.name}...` });
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/human-resources/documents/upload", {
        method: "POST",
        body: formData
      });
      const body = (await response.json()) as {
        storageKey?: string;
        fileName?: string;
        mimeType?: string | null;
        fileSizeBytes?: number;
        message?: string;
      };
      if (!response.ok || !body.storageKey) {
        throw new Error(body.message ?? "Flash ERP could not upload the HR document.");
      }
      setDraft((current) => ({
        ...current,
        storageKey: body.storageKey,
        fileName: body.fileName ?? file.name,
        mimeType: body.mimeType ?? file.type,
        fileSizeBytes: body.fileSizeBytes ?? file.size,
        externalUrl: ""
      }));
      setMutationState({ status: "success", message: body.message ?? "File uploaded." });
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not upload the HR document."
      });
    } finally {
      event.target.value = "";
    }
  }

  async function save() {
    setMutationState({ status: "submitting", message: "Saving employee document..." });
    try {
      const response = await fetch("/api/human-resources/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      const body = (await response.json()) as Partial<ErpHrDocumentMutationResponse> & {
        message?: string;
      };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not save the HR document.");
      setMutationState({ status: "success", message: body.message ?? "HR document saved." });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not save the HR document."
      });
    }
  }

  async function archive(row: DocumentRow) {
    setMutationState({ status: "submitting", message: `Archiving ${row.documentNo}...` });
    try {
      const response = await fetch(`/api/human-resources/documents/${row.documentId}`, {
        method: "DELETE"
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Flash ERP could not archive the document.");
      setMutationState({ status: "success", message: body.message ?? "Document archived." });
      setArchivingDocument(null);
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not archive the document."
      });
    }
  }

  const columns = useMemo<ColumnDef<DocumentRow>[]>(
    () => [
      { accessorKey: "documentNo", header: "Document" },
      { accessorKey: "employeeNo", header: "Employee ID" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "departmentName", header: "Department" },
      {
        accessorKey: "documentType",
        header: "Type",
        cell: ({ row }) => formatHrEnum(row.original.documentType)
      },
      { accessorKey: "title", header: "Title" },
      { accessorKey: "referenceNo", header: "Reference" },
      { accessorKey: "issueDate", header: "Issued" },
      { accessorKey: "expiryDate", header: "Expires" },
      { accessorKey: "fileName", header: "File" },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.status} />
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const actions = [] as Array<{
            label: string;
            tone?: "default" | "primary" | "danger";
            onSelect: () => void;
          }>;
          if (row.original.fileUrl) {
            actions.push({
              label: "Open document",
              tone: "primary",
              onSelect: () => window.open(row.original.fileUrl!, "_blank", "noopener,noreferrer")
            });
          }
          if (row.original.status === "ACTIVE") {
            actions.push({
              label: "Edit metadata",
              onSelect: () => {
                setMutationState({ status: "idle", message: "" });
                setDraft({ ...row.original, storageKey: undefined, externalUrl: row.original.externalUrl });
                setOpen(true);
              }
            });
            actions.push({ label: "Archive", tone: "danger", onSelect: () => setArchivingDocument(row.original) });
          }
          return actions.length ? <GridRowActions actions={actions} /> : null;
        }
      }
    ],
    []
  );

  const dialog = (
    <ActionDialog
      description="Attach protected employee records or register an approved external document link."
      onOpenChange={(next) => {
        if (next && !open) startNew();
        setOpen(next);
      }}
      open={open}
      title={draft.documentId ? "Employee Document" : "New Employee Document"}
      triggerClassName="rounded-xl"
      triggerIcon={Plus}
      triggerLabel="New Document"
      widthClassName="max-w-3xl"
    >
      <div className="space-y-4">
        <HrMutationNotice state={mutationState} />
        <div className="grid gap-4 md:grid-cols-2">
          <HrFieldSelect
            label="Employee"
            onChange={(value) => setDraft((current) => ({ ...current, employeeId: value }))}
            options={employeeOptions}
            value={draft.employeeId}
          />
          <HrFieldSelect
            label="Document type"
            onChange={(value) => setDraft((current) => ({ ...current, documentType: value }))}
            options={typeOptions}
            value={draft.documentType}
          />
          <HrFieldInput
            label="Title"
            onChange={(value) => setDraft((current) => ({ ...current, title: value }))}
            value={draft.title}
          />
          <HrFieldInput
            label="Reference number"
            onChange={(value) => setDraft((current) => ({ ...current, referenceNo: value }))}
            value={draft.referenceNo}
          />
          <HrFieldInput
            label="Issue date"
            onChange={(value) => setDraft((current) => ({ ...current, issueDate: value }))}
            type="date"
            value={draft.issueDate as string | null}
          />
          <HrFieldInput
            label="Expiry date"
            onChange={(value) => setDraft((current) => ({ ...current, expiryDate: value }))}
            type="date"
            value={draft.expiryDate as string | null}
          />
          <HrFieldInput
            label="External document URL"
            onChange={(value) =>
              setDraft((current) => ({ ...current, externalUrl: value, storageKey: value ? "" : current.storageKey }))
            }
            placeholder="https://..."
            value={draft.externalUrl}
          />
          <div className="space-y-2">
            <span className="block text-sm font-semibold text-stone-900">Protected file</span>
            <input
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              className="hidden"
              onChange={(event) => void uploadFile(event)}
              ref={fileInputRef}
              type="file"
            />
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <Upload className="h-4 w-4" />
              {draft.fileName || "Choose file"}
            </button>
          </div>
        </div>
        <HrFieldTextArea
          label="Note"
          onChange={(value) => setDraft((current) => ({ ...current, note: value }))}
          value={draft.note}
        />
        <HrDialogFooter
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setOpen(false)}
          onSave={() => void save()}
        />
      </div>
    </ActionDialog>
  );

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Human Resources"
      heading="HR Documents"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={FileText} label="Active Documents" value={workspace.metrics.activeDocuments} />
          <HrMetric icon={AlertTriangle} label="Expiring in 30 Days" value={workspace.metrics.expiringWithin30Days} />
          <HrMetric icon={Archive} label="Expired" value={workspace.metrics.expiredDocuments} />
          <HrMetric icon={ShieldCheck} label="Employees Covered" value={workspace.metrics.employeesWithDocuments} />
        </section>
        <HrMutationNotice state={mutationState} />
        <section className="grid gap-3 border-y border-slate-200 bg-slate-50/60 px-4 py-3 md:grid-cols-4">
          <HrFieldSelect
            label="Employee"
            onChange={(value) => setFilters((current) => ({ ...current, employeeId: value }))}
            options={[{ label: "All employees", value: "" }, ...employeeOptions.slice(1)]}
            value={filters.employeeId}
          />
          <HrFieldSelect
            label="Document type"
            onChange={(value) => setFilters((current) => ({ ...current, documentType: value }))}
            options={[{ label: "All document types", value: "" }, ...workspace.documentTypeOptions]}
            value={filters.documentType}
          />
          <HrFieldSelect
            label="Status"
            onChange={(value) => setFilters((current) => ({ ...current, status: value }))}
            options={[
              { label: "All statuses", value: "" },
              { label: "Active", value: "ACTIVE" },
              { label: "Archived", value: "DELETED" }
            ]}
            value={filters.status}
          />
          <HrFieldSelect
            label="Expiry"
            onChange={(value) => setFilters((current) => ({ ...current, expiry: value }))}
            options={[
              { label: "All expiry dates", value: "" },
              { label: "Expired", value: "EXPIRED" },
              { label: "Next 30 days", value: "EXPIRING" },
              { label: "No expiry", value: "NO_EXPIRY" }
            ]}
            value={filters.expiry}
          />
        </section>
        <SharedDataGrid
          columns={columns}
          data={filteredRows}
          emptyLabel="No HR documents match the selected filters."
          exportFileName="flash-erp-hr-documents"
          initialPageSize={20}
          searchPlaceholder="Search HR documents"
          toolbarActions={dialog}
        />
        <ConfirmationDialog
          confirmLabel="Archive document"
          description={
            archivingDocument ? (
              <span>
                Archive HR document <strong>{archivingDocument.documentNo}</strong>. The file link and audit metadata are retained.
              </span>
            ) : null
          }
          isSubmitting={mutationState.status === "submitting"}
          onCancel={() => setArchivingDocument(null)}
          onConfirm={() => archivingDocument && void archive(archivingDocument)}
          open={Boolean(archivingDocument)}
          title="Archive HR document"
          tone="danger"
        />
      </div>
    </EnterpriseShell>
  );
}
