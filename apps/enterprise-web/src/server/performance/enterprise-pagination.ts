export const ENTERPRISE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export type EnterprisePageInput = {
  page?: number | string | null;
  pageSize?: number | string | null;
  search?: string | null;
};

export type EnterprisePageInfo = {
  page: number;
  pageSize: number;
  search: string;
  totalRows: number;
  totalPages: number;
};

export function normalizeEnterprisePageInput(
  input?: EnterprisePageInput,
  defaultPageSize = ENTERPRISE_PAGE_SIZE_OPTIONS[0]
) {
  const requestedPage = Number(input?.page ?? 1);
  const requestedPageSize = Number(input?.pageSize ?? defaultPageSize);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = ENTERPRISE_PAGE_SIZE_OPTIONS.includes(
    requestedPageSize as (typeof ENTERPRISE_PAGE_SIZE_OPTIONS)[number]
  )
    ? requestedPageSize
    : defaultPageSize;

  return {
    page,
    pageSize,
    search: String(input?.search ?? "").trim().slice(0, 120),
    skip: (page - 1) * pageSize
  };
}

export function buildEnterprisePageInfo(
  input: ReturnType<typeof normalizeEnterprisePageInput>,
  totalRows: number
): EnterprisePageInfo {
  return {
    page: input.page,
    pageSize: input.pageSize,
    search: input.search,
    totalRows,
    totalPages: totalRows === 0 ? 0 : Math.ceil(totalRows / input.pageSize)
  };
}
