"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCcw,
  Save,
  TimerReset,
  UserX
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { SharedDataGrid } from "@/components/data-grid/data-grid";
import { EnterpriseShell } from "@/components/layouts/enterprise-shell";
import {
  HrFieldInput,
  HrFieldSelect,
  HrMetric,
  HrMutationNotice,
  HrStatusBadge,
  type HrMutationState
} from "@/components/enterprise/erp-hr-ui";
import type {
  ErpAttendanceBatchData,
  ErpAttendanceBatchMutationResponse,
  ErpAttendanceBatchRow,
  ErpAttendanceWorkspaceData
} from "@/server/repositories/erp-hr-attendance.repository";

type AttendanceHistoryRow = ErpAttendanceWorkspaceData["attendanceRows"][number];

function workTimeLabel(checkInTime: string, checkOutTime: string) {
  if (!checkInTime || !checkOutTime) return "-";
  const [inHour, inMinute] = checkInTime.split(":").map(Number);
  const [outHour, outMinute] = checkOutTime.split(":").map(Number);
  let minutes = outHour * 60 + outMinute - (inHour * 60 + inMinute);
  if (minutes < 0) minutes += 24 * 60;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function ErpHrAttendanceWorkspace({
  workspace,
  canManage
}: {
  workspace: ErpAttendanceWorkspaceData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState({
    workDate: workspace.initialBatch.workDate,
    departmentId: workspace.initialBatch.departmentId ?? "",
    positionId: workspace.initialBatch.positionId ?? "",
    storeId: workspace.initialBatch.storeId ?? ""
  });
  const [rows, setRows] = useState<ErpAttendanceBatchRow[]>(workspace.initialBatch.rows);
  const [bulkTimes, setBulkTimes] = useState({ checkInTime: "08:00", checkOutTime: "17:00" });
  const [mutationState, setMutationState] = useState<HrMutationState>({
    status: "idle",
    message: ""
  });

  const departmentOptions = useMemo(
    () => [
      { label: "All departments", value: "" },
      ...workspace.departmentOptions.map((department) => ({
        label: `${department.code} - ${department.name}`,
        value: department.departmentId
      }))
    ],
    [workspace.departmentOptions]
  );
  const positionOptions = useMemo(
    () => [
      { label: "All positions", value: "" },
      ...workspace.positionOptions
        .filter(
          (position) => !criteria.departmentId || position.departmentId === criteria.departmentId
        )
        .map((position) => ({
          label: `${position.code} - ${position.title}`,
          value: position.positionId
        }))
    ],
    [criteria.departmentId, workspace.positionOptions]
  );
  const storeOptions = useMemo(
    () => [
      { label: "All shops / HQ", value: "" },
      ...workspace.storeOptions.map((store) => ({
        label: `${store.code} - ${store.name}`,
        value: store.storeId
      }))
    ],
    [workspace.storeOptions]
  );

  async function fetchBatch() {
    const params = new URLSearchParams({ workDate: criteria.workDate });
    if (criteria.departmentId) params.set("departmentId", criteria.departmentId);
    if (criteria.positionId) params.set("positionId", criteria.positionId);
    if (criteria.storeId) params.set("storeId", criteria.storeId);
    const response = await fetch(`/api/human-resources/attendance?${params.toString()}`, {
      cache: "no-store"
    });
    const body = (await response.json()) as Partial<ErpAttendanceBatchData> & { message?: string };
    if (!response.ok || !Array.isArray(body.rows)) {
      throw new Error(body.message ?? "Flash ERP could not load the attendance roster.");
    }
    return body as ErpAttendanceBatchData;
  }

  async function loadRoster() {
    setMutationState({ status: "submitting", message: "Loading attendance roster..." });
    try {
      const batch = await fetchBatch();
      setRows(batch.rows);
      setMutationState({
        status: "success",
        message: `Loaded ${batch.rows.length} employee(s) for ${batch.workDate}.`
      });
    } catch (error) {
      setMutationState({
        status: "error",
        message: error instanceof Error ? error.message : "Flash ERP could not load attendance."
      });
    }
  }

  async function saveBatch() {
    setMutationState({ status: "submitting", message: "Saving batch attendance..." });
    try {
      const response = await fetch("/api/human-resources/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workDate: criteria.workDate, rows })
      });
      const body = (await response.json()) as Partial<ErpAttendanceBatchMutationResponse> & {
        message?: string;
      };
      if (!response.ok) {
        throw new Error(body.message ?? "Flash ERP could not save batch attendance.");
      }
      const batch = await fetchBatch();
      setRows(batch.rows);
      setMutationState({ status: "success", message: body.message ?? "Attendance saved." });
      router.refresh();
    } catch (error) {
      setMutationState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Flash ERP could not save batch attendance."
      });
    }
  }

  function updateRow(employeeId: string, patch: Partial<ErpAttendanceBatchRow>) {
    setRows((current) =>
      current.map((row) => (row.employeeId === employeeId ? { ...row, ...patch } : row))
    );
  }

  function togglePresent(employeeId: string, present: boolean) {
    updateRow(employeeId, {
      present,
      attendanceStatus: present ? "PRESENT" : "ABSENT",
      ...(present
        ? {}
        : { checkInTime: "", checkOutTime: "", lateMinutes: 0, overtimeHours: 0 })
    });
  }

  function setAllPresent(present: boolean) {
    setRows((current) =>
      current.map((row) =>
        ["LEAVE", "OFF_DAY"].includes(row.attendanceStatus)
          ? row
          : {
              ...row,
              present,
              attendanceStatus: present ? "PRESENT" : "ABSENT",
              ...(present
                ? {}
                : { checkInTime: "", checkOutTime: "", lateMinutes: 0, overtimeHours: 0 })
            }
      )
    );
  }

  function applyBulkTimes() {
    setRows((current) =>
      current.map((row) =>
        row.present
          ? {
              ...row,
              checkInTime: bulkTimes.checkInTime,
              checkOutTime: bulkTimes.checkOutTime
            }
          : row
      )
    );
  }

  const allPresent = rows.length > 0 && rows.every((row) => row.present);
  const presentCount = rows.filter((row) => row.present).length;
  const existingCount = rows.filter((row) => row.hasExistingRecord).length;

  const historyColumns = useMemo<ColumnDef<AttendanceHistoryRow>[]>(
    () => [
      { accessorKey: "workDate", header: "Work Date" },
      { accessorKey: "employeeNo", header: "Employee ID" },
      { accessorKey: "employeeName", header: "Employee" },
      { accessorKey: "departmentName", header: "Department" },
      { accessorKey: "positionTitle", header: "Position" },
      {
        id: "shop",
        header: "Shop",
        cell: ({ row }) => row.original.storeName ?? "HQ / unassigned"
      },
      {
        accessorKey: "attendanceStatus",
        header: "Status",
        cell: ({ row }) => <HrStatusBadge value={row.original.attendanceStatus} />
      },
      {
        accessorKey: "checkInAt",
        header: "Check In",
        cell: ({ row }) =>
          row.original.checkInAt ? new Date(row.original.checkInAt).toLocaleString() : "-"
      },
      {
        accessorKey: "checkOutAt",
        header: "Check Out",
        cell: ({ row }) =>
          row.original.checkOutAt ? new Date(row.original.checkOutAt).toLocaleString() : "-"
      },
      { accessorKey: "lateMinutes", header: "Late (min)" },
      { accessorKey: "overtimeHours", header: "Overtime" },
      { accessorKey: "changeCount", header: "Audit Entries" }
    ],
    []
  );

  return (
    <EnterpriseShell
      activeSection="human-resources"
      description={workspace.statusMessage}
      eyebrow="Flash ERP Human Resources"
      heading="Attendance"
    >
      <div className="space-y-5">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <HrMetric icon={CalendarCheck} label="Today Recorded" value={workspace.metrics.todayRecords} />
          <HrMetric icon={Clock3} label="Present Today" value={workspace.metrics.todayPresent} />
          <HrMetric icon={UserX} label="Absent Today" value={workspace.metrics.todayAbsent} />
          <HrMetric
            icon={TimerReset}
            label="Period Overtime"
            value={workspace.metrics.periodOvertimeHours.toFixed(2)}
          />
        </section>

        <HrMutationNotice state={mutationState} />

        <section className="border-y border-slate-200 bg-white">
          <div className="grid gap-3 bg-slate-50 px-4 py-4 md:grid-cols-2 xl:grid-cols-[0.8fr_1fr_1fr_1fr_auto]">
            <HrFieldInput
              label="Work date"
              onChange={(value) => setCriteria((current) => ({ ...current, workDate: value }))}
              type="date"
              value={criteria.workDate}
            />
            <HrFieldSelect
              label="Department"
              onChange={(value) =>
                setCriteria((current) => ({ ...current, departmentId: value, positionId: "" }))
              }
              options={departmentOptions}
              value={criteria.departmentId}
            />
            <HrFieldSelect
              label="Position"
              onChange={(value) => setCriteria((current) => ({ ...current, positionId: value }))}
              options={positionOptions}
              value={criteria.positionId}
            />
            <HrFieldSelect
              label="Shop / site"
              onChange={(value) => setCriteria((current) => ({ ...current, storeId: value }))}
              options={storeOptions}
              value={criteria.storeId}
            />
            <div className="flex items-end">
              <button
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                onClick={() => void loadRoster()}
                type="button"
              >
                {mutationState.status === "submitting" ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcw className="h-4 w-4" />
                )}
                Load
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 px-4 py-3">
            <label className="flex h-10 items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                checked={allPresent}
                className="h-4 w-4 accent-emerald-600"
                disabled={!canManage || !rows.length}
                onChange={(event) => setAllPresent(event.target.checked)}
                type="checkbox"
              />
              Mark all present
            </label>
            <div className="w-36">
              <HrFieldInput
                label="Default check-in"
                onChange={(value) => setBulkTimes((current) => ({ ...current, checkInTime: value }))}
                type="time"
                value={bulkTimes.checkInTime}
              />
            </div>
            <div className="w-36">
              <HrFieldInput
                label="Default check-out"
                onChange={(value) => setBulkTimes((current) => ({ ...current, checkOutTime: value }))}
                type="time"
                value={bulkTimes.checkOutTime}
              />
            </div>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              disabled={!canManage || !presentCount}
              onClick={applyBulkTimes}
              type="button"
            >
              <Clock3 className="h-4 w-4" />
              Apply times
            </button>
            <div className="ml-auto flex h-10 items-center gap-3 text-sm text-slate-600">
              <span>{rows.length} employees</span>
              <span className="font-semibold text-emerald-700">{presentCount} present</span>
              <span>{existingCount} saved</span>
              {canManage ? (
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!rows.length || mutationState.status === "submitting"}
                  onClick={() => void saveBatch()}
                  type="button"
                >
                  <Save className="h-4 w-4" />
                  Save Attendance
                </button>
              ) : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-sm">
              <thead className="bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
                <tr>
                  <th className="w-20 px-3 py-3 text-center">Present</th>
                  <th className="px-3 py-3">Employee ID</th>
                  <th className="px-3 py-3">Employee</th>
                  <th className="px-3 py-3">Department</th>
                  <th className="px-3 py-3">Position</th>
                  <th className="w-32 px-3 py-3">Check In</th>
                  <th className="w-32 px-3 py-3">Check Out</th>
                  <th className="w-24 px-3 py-3">Worktime</th>
                  <th className="w-24 px-3 py-3">Late</th>
                  <th className="w-24 px-3 py-3">Overtime</th>
                  <th className="w-28 px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const specialStatus = ["LEAVE", "OFF_DAY"].includes(row.attendanceStatus);
                  return (
                    <tr className="border-t border-slate-200 odd:bg-white even:bg-slate-50/60" key={row.employeeId}>
                      <td className="px-3 py-2 text-center">
                        <input
                          checked={row.present}
                          className="h-5 w-5 accent-emerald-600"
                          disabled={!canManage || specialStatus}
                          onChange={(event) => togglePresent(row.employeeId, event.target.checked)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.employeeNo}</td>
                      <td className="px-3 py-2 font-semibold text-slate-950">{row.employeeName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.departmentName}</td>
                      <td className="px-3 py-2 text-slate-700">{row.positionTitle}</td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                          disabled={!canManage || !row.present}
                          onChange={(event) => updateRow(row.employeeId, { checkInTime: event.target.value })}
                          type="time"
                          value={row.checkInTime}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                          disabled={!canManage || !row.present}
                          onChange={(event) => updateRow(row.employeeId, { checkOutTime: event.target.value })}
                          type="time"
                          value={row.checkOutTime}
                        />
                      </td>
                      <td className="px-3 py-2 font-semibold text-slate-700">
                        {row.present ? workTimeLabel(row.checkInTime, row.checkOutTime) : "-"}
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                          disabled={!canManage || !row.present}
                          min="0"
                          onChange={(event) =>
                            updateRow(row.employeeId, {
                              lateMinutes: Number(event.target.value),
                              attendanceStatus: Number(event.target.value) > 0 ? "LATE" : "PRESENT"
                            })
                          }
                          type="number"
                          value={row.lateMinutes}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          className="h-9 w-full rounded border border-slate-300 bg-white px-2 disabled:bg-slate-100"
                          disabled={!canManage || !row.present}
                          min="0"
                          onChange={(event) =>
                            updateRow(row.employeeId, { overtimeHours: Number(event.target.value) })
                          }
                          step="0.25"
                          type="number"
                          value={row.overtimeHours}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {row.hasExistingRecord ? (
                          <HrStatusBadge value={row.attendanceStatus} />
                        ) : row.present ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <span className="text-xs text-slate-500">Unsaved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td className="px-4 py-12 text-center text-sm text-slate-500" colSpan={11}>
                      No active employees match the selected criteria.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-950">Recent Attendance History</h2>
          <SharedDataGrid
            columns={historyColumns}
            data={workspace.attendanceRows}
            emptyLabel="No attendance records found."
            exportFileName="flash-erp-attendance"
            initialPageSize={20}
            searchPlaceholder="Search attendance history"
          />
        </section>
      </div>
    </EnterpriseShell>
  );
}
