import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    service: "Flash ERP Enterprise API",
    status: "online",
    version: "1.1.0",
    environment: process.env.NODE_ENV ?? "production",
    timestamp: new Date().toISOString(),
    endpoints: {
      documentation: "/api/docs",
      openapi: "/api/openapi.json",
      systemHealth: "/api/system/live",
      databaseReadiness: "/api/system/database-readiness",
      auth: {
        signIn: "/api/auth/sign-in",
        session: "/api/auth/session",
        profile: "/api/auth/profile",
        signOut: "/api/auth/sign-out",
        mfaVerify: "/api/auth/mfa/verify",
        stepUp: "/api/auth/step-up"
      },
      onlineStore: {
        inventoryLookup: "/api/online-store/inventory-lookup",
        stockCounts: "/api/online-store/stock-counts",
        goodsReceipts: "/api/online-store/goods-receipts",
        transfers: "/api/online-store/transfers",
        sales: "/api/online-store/sales",
        salesOrders: "/api/online-store/sales-orders",
        heldSales: "/api/online-store/held-sales",
        corrections: "/api/online-store/corrections",
        shifts: "/api/online-store/shifts/open",
        eod: "/api/online-store/eod",
        reports: "/api/online-store/reports"
      },
      catalog: {
        products: "/api/catalog/products",
        storePrices: "/api/catalog/store-prices"
      },
      inventory: {
        purchaseOrders: "/api/inventory/purchase-orders",
        locations: "/api/inventory/locations"
      },
      humanResources: {
        attendance: "/api/human-resources/attendance",
        leave: "/api/human-resources/leave",
        expenseClaims: "/api/human-resources/expense-claims",
        employees: "/api/human-resources/employees"
      },
      mobile: {
        dashboard: "/api/mobile/dashboard",
        approvals: "/api/mobile/approvals"
      },
      fuelOperations: {
        dips: "/api/fuel-operations/dips",
        meterReadings: "/api/fuel-operations/meter-readings",
        deliveries: "/api/fuel-operations/deliveries",
        evidence: "/api/fuel-operations/evidence"
      }
    }
  });
}
