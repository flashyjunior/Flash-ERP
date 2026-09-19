import type { MobileUserSession } from "./mobile-api";

export const MOBILE_ROUTE_PERMISSIONS: Record<string, string[]> = {
  scanner: ["inventory.view"],
  "stock-count": ["inventory.count.submit", "inventory.count.commit"],
  "goods-receipt": ["inventory.grn.receive"],
  transfers: [
    "inventory.transfer.request",
    "inventory.transfer.issue",
    "inventory.transfer.receive",
  ],
  cart: ["pos.sale.process", "pos.sell"],
  returns: ["pos.return.process", "pos.refund"],
  "fuel-operations": [
    "fuel.station.view",
    "fuel.dip.capture",
    "fuel.meter-reading.capture",
  ],
};

export const SHOP_ROUTES = new Set(Object.keys(MOBILE_ROUTE_PERMISSIONS));

export function hasAnyPermission(
  user: MobileUserSession | null | undefined,
  permissions: string[],
): boolean {
  if (!user || permissions.length === 0) return false;
  return permissions.some((permission) => user.permissionCodes?.includes(permission));
}

export function canOpenMobileRoute(
  user: MobileUserSession | null | undefined,
  route: string,
): boolean {
  if (!user) return false;
  if (SHOP_ROUTES.has(route) && !user.homeStoreCode) return false;
  if (route === "approvals") {
    return user.permissionCodes?.some((permission) => permission.includes("approve")) ?? false;
  }
  const permissions = MOBILE_ROUTE_PERMISSIONS[route];
  return !permissions || hasAnyPermission(user, permissions);
}
