"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type ColumnDef,
  type FilterFn,
  type PaginationState,
  type SortingState,
  type VisibilityState,
  useReactTable
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  FileSpreadsheet,
  MoreHorizontal,
  Search,
  SlidersHorizontal
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode
} from "react";

import { cn } from "@/lib/utils/cn";

type GridColumnMeta = {
  headerClassName?: string;
  cellClassName?: string;
  disableTruncate?: boolean;
};

type SharedDataGridProps<TData> = {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  emptyLabel: string;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  initialSearchValue?: string;
  globalFilterFn?: FilterFn<TData>;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  initialPageSize?: number;
  pageSizeOptions?: number[];
  toolbarFilters?: ReactNode;
  toolbarActions?: ReactNode;
  exportFileName?: string;
  getRowHref?: (row: TData) => string | null;
};

type GridRowAction = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
};

function getMeta<TData>(column: ColumnDef<TData, unknown> | undefined) {
  return (column?.meta as GridColumnMeta | undefined) ?? {};
}

function getColumnLabel<TData>(column: {
  id: string;
  columnDef: ColumnDef<TData, unknown>;
}) {
  const header = column.columnDef.header;
  return typeof header === "string" ? header : column.id;
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      "a, button, input, select, textarea, label, summary, details, [role='button']"
    )
  );
}

export function GridRowActions({
  actions,
  label = "Open row actions"
}: {
  actions: GridRowAction[];
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function closeMenu() {
      setIsOpen(false);
    }

    function handlePointerDown(event: globalThis.MouseEvent) {
      const target = event.target as Node | null;

      if (target && (buttonRef.current?.contains(target) || menuRef.current?.contains(target))) {
        return;
      }

      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMenu();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeMenu, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, [isOpen]);

  function toggleMenu(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();

    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPosition({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right)
      });
    }

    setIsOpen((current) => !current);
  }

  const menu =
    isOpen && menuPosition
      ? createPortal(
          <div
            className="fixed z-[95] min-w-44 overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
            ref={menuRef}
            style={{
              top: menuPosition.top,
              right: menuPosition.right
            }}
          >
            {actions.map((action) => (
              <button
                className={cn(
                  "flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  action.tone === "danger"
                    ? "text-rose-700 hover:bg-rose-50"
                    : action.tone === "primary"
                      ? "text-[var(--brand-deep)] hover:bg-sky-50"
                      : "text-stone-700 hover:bg-stone-50 hover:text-stone-950"
                )}
                disabled={action.disabled}
                key={action.label}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  if (action.disabled) {
                    return;
                  }

                  setIsOpen(false);
                  action.onSelect();
                }}
                type="button"
              >
                {action.label}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex justify-end">
      <button
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={label}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 transition hover:border-stone-400 hover:bg-stone-50 hover:text-stone-950"
        onClick={toggleMenu}
        ref={buttonRef}
        title={label}
        type="button"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {menu}
    </div>
  );
}

export function SharedDataGrid<TData>({
  data,
  columns,
  emptyLabel,
  searchPlaceholder = "Search current results",
  hideSearch = false,
  initialSearchValue = "",
  globalFilterFn,
  initialSorting = [],
  initialColumnVisibility,
  initialPageSize = 10,
  pageSizeOptions = [10, 20, 50],
  toolbarFilters,
  toolbarActions,
  exportFileName = "grid-export",
  getRowHref
}: SharedDataGridProps<TData>) {
  const router = useRouter();
  const columnPanelRef = useRef<HTMLDivElement | null>(null);
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialColumnVisibility ?? {}
  );
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize
  });
  const [searchValue, setSearchValue] = useState(initialSearchValue);
  const [isColumnPanelOpen, setIsColumnPanelOpen] = useState(false);
  const deferredSearchValue = useDeferredValue(searchValue);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter: deferredSearchValue,
      columnVisibility,
      pagination
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: true
  });

  useEffect(() => {
    if (!isColumnPanelOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent | globalThis.MouseEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!columnPanelRef.current?.contains(event.target)) {
        setIsColumnPanelOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isColumnPanelOpen]);

  const toggleableColumns = useMemo(
    () => table.getAllLeafColumns().filter((column) => column.getCanHide()),
    [table]
  );
  const visibleCount = table.getFilteredRowModel().rows.length;
  const exportableColumns = useMemo(() => table.getVisibleLeafColumns(), [table]);

  function sanitizeExportValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "";
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizeExportValue(item))
        .filter(Boolean)
        .join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function exportExcel() {
    const headers = exportableColumns.map((column) =>
      getColumnLabel({
        id: column.id,
        columnDef: column.columnDef
      })
    );
    const rows = table.getFilteredRowModel().rows.map((row) =>
      exportableColumns.map((column) => sanitizeExportValue(row.getValue(column.id)))
    );
    const escapeHtml = (value: string) =>
      value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;");
    const worksheet = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table><thead><tr>${headers
      .map((value) => `<th>${escapeHtml(value)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map((row) => `<tr>${row.map((value) => `<td>${escapeHtml(value)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></body></html>`;

    const blob = new Blob([worksheet], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${exportFileName}.xls`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }

  function renderSortIcon(state: false | "asc" | "desc") {
    if (state === "asc") {
      return <ArrowUp className="h-3.5 w-3.5 text-stone-500" />;
    }

    if (state === "desc") {
      return <ArrowDown className="h-3.5 w-3.5 text-stone-500" />;
    }

    return <ArrowUpDown className="h-3.5 w-3.5 text-stone-400" />;
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: TData) {
    const href = getRowHref?.(row);

    if (!href || isInteractiveTarget(event.target)) {
      return;
    }

    router.push(href);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[1.2rem] border border-[color:var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,248,252,0.92))] p-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
            {hideSearch ? null : (
              <label className="relative w-full lg:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 pl-9 text-sm placeholder:text-stone-400 outline-none transition focus:border-[var(--brand)] focus:shadow-[0_0_0_4px_rgba(37,99,235,0.08)]"
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder={searchPlaceholder}
                  value={searchValue}
                />
              </label>
            )}

            {toolbarFilters ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-600">
                  <SlidersHorizontal className="h-4 w-4 text-stone-400" />
                  Filters
                </div>
                {toolbarFilters}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700">
              {visibleCount} visible
            </div>

            {toolbarActions}

            {exportableColumns.length > 0 && visibleCount > 0 ? (
              <button
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                onClick={exportExcel}
                type="button"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export Excel
              </button>
            ) : null}

            {toggleableColumns.length > 0 ? (
              <div className="relative" ref={columnPanelRef}>
                <button
                  className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-400 hover:text-stone-950"
                  onClick={() => setIsColumnPanelOpen((current) => !current)}
                  type="button"
                >
                  <Columns3 className="h-4 w-4" />
                  Columns
                </button>

                {isColumnPanelOpen ? (
                  <div className="absolute right-0 z-20 mt-2 w-64 rounded-[1rem] border border-stone-200 bg-white p-3 shadow-[0_18px_44px_rgba(62,42,29,0.12)]">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-stone-950">Visible columns</p>
                      <button
                        className="text-xs font-semibold text-[var(--brand)] transition hover:text-[var(--brand-deep)]"
                        onClick={() => setColumnVisibility(initialColumnVisibility ?? {})}
                        type="button"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="space-y-2">
                      {toggleableColumns.map((column) => (
                        <label
                          className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-sm text-stone-700"
                          key={column.id}
                        >
                          <span className="truncate">{getColumnLabel(column)}</span>
                          <input
                            checked={column.getIsVisible()}
                            className="h-4 w-4"
                            onChange={column.getToggleVisibilityHandler()}
                            type="checkbox"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-[1.2rem] border border-stone-200 bg-white shadow-[0_12px_30px_rgba(62,42,29,0.08)]">
        <div className="overflow-x-auto">
          <table className="min-w-full table-fixed border-collapse">
            <thead className="bg-stone-100/90">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const meta = getMeta(header.column.columnDef);

                    return (
                      <th
                        className={cn(
                          "px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500",
                          meta.headerClassName
                        )}
                        key={header.id}
                      >
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            className="inline-flex items-center gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 transition hover:text-stone-900"
                            onClick={header.column.getToggleSortingHandler()}
                            type="button"
                          >
                            <span className="truncate">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {renderSortIcon(header.column.getIsSorted())}
                          </button>
                        ) : (
                          <span className="truncate">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>

            <tbody>
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => {
                  const href = getRowHref?.(row.original);

                  return (
                    <tr
                      className={cn(
                        "border-t border-stone-200/80 transition",
                        href
                          ? "cursor-pointer hover:bg-[rgba(241,245,249,0.78)]"
                          : "hover:bg-[rgba(248,250,252,0.72)]"
                      )}
                      key={row.id}
                      onClick={(event) => handleRowClick(event, row.original)}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = getMeta(cell.column.columnDef);

                        return (
                          <td
                            className={cn("px-3 py-2.5 text-sm text-stone-700", meta.cellClassName)}
                            key={cell.id}
                          >
                            {meta.disableTruncate ? (
                              <div className="min-w-0">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            ) : (
                              <div className="min-w-0 truncate">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    className="px-4 py-12 text-center text-sm text-stone-600"
                    colSpan={table.getAllLeafColumns().length}
                  >
                    {emptyLabel}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[1.1rem] border border-[color:var(--line)] bg-white/90 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
          <span>
            Page {table.getPageCount() === 0 ? 0 : table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <span className="text-stone-300">•</span>
          <span>{visibleCount} filtered row(s)</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700">
            <span>Rows</span>
            <select
              className="bg-transparent outline-none"
              onChange={(event) =>
                setPagination({
                  pageIndex: 0,
                  pageSize: Number(event.target.value)
                })
              }
              value={pagination.pageSize}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-1">
            <button
              className="rounded-lg border border-stone-200 bg-white p-2 text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
              type="button"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg border border-stone-200 bg-white p-2 text-stone-700 transition hover:border-stone-400 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
              type="button"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
