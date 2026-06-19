const dateRangeParameters = [
  { name: "from", in: "query", schema: { type: "string", format: "date" } },
  { name: "to", in: "query", schema: { type: "string", format: "date" } }
];

const shopParameter = { name: "shop", in: "query", schema: { type: "string" } };
const limitParameter = {
  name: "limit",
  in: "query",
  schema: { type: "integer", minimum: 1, maximum: 500 }
};

function listResponse(schemaRef: string, description: string) {
  return {
    "200": {
      description,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: schemaRef }
              },
              count: { type: "integer" },
              limit: { type: "integer" }
            }
          }
        }
      }
    }
  };
}

function getListPath(input: {
  summary: string;
  tag: string;
  parameters?: Array<Record<string, unknown>>;
  schemaRef: string;
  responseDescription: string;
}) {
  return {
    get: {
      summary: input.summary,
      tags: [input.tag],
      parameters: input.parameters ?? [limitParameter],
      responses: listResponse(input.schemaRef, input.responseDescription)
    }
  };
}

export function buildFlashRmsOpenApiDocument() {
  return {
    openapi: "3.0.3",
    info: {
      title: "Flash ERP Integration API",
      version: "1.1.0",
      description:
        "Versioned HQ integration endpoints for inventory, catalog pricing, master data, sales, purchasing, finance, operating expenses, and demand forecasts."
    },
    servers: [
      {
        url: process.env.NEXT_PUBLIC_ENTERPRISE_URL ?? "http://localhost:3000",
        description: "Flash ERP Enterprise"
      }
    ],
    security: [
      {
        bearerAuth: []
      },
      {
        apiKeyAuth: []
      }
    ],
    paths: {
      "/api/integrations/v1/inventory/ledger": getListPath({
        summary: "List canonical HQ stock ledger movements",
        tag: "Inventory",
        parameters: [
          ...dateRangeParameters,
          shopParameter,
          { name: "productCode", in: "query", schema: { type: "string" } },
          limitParameter
        ],
        schemaRef: "#/components/schemas/InventoryLedgerEntry",
        responseDescription: "Stock ledger entries"
      }),
      "/api/integrations/v1/catalog/prices": getListPath({
        summary: "List customer-group and loyalty-tier price rows",
        tag: "Catalog",
        parameters: [
          { name: "priceListCode", in: "query", schema: { type: "string" } },
          { name: "productCode", in: "query", schema: { type: "string" } },
          {
            name: "customerType",
            in: "query",
            schema: {
              type: "string",
              enum: ["INDIVIDUAL", "CORPORATE", "WHOLESALE", "STAFF", "OTHER"]
            }
          },
          { name: "loyaltyTier", in: "query", schema: { type: "string" } },
          limitParameter
        ],
        schemaRef: "#/components/schemas/PriceRow",
        responseDescription: "Price rows"
      }),
      "/api/integrations/v1/master/customers": getListPath({
        summary: "List customer master rows and receivable posture",
        tag: "Master Data",
        parameters: [
          { name: "q", in: "query", schema: { type: "string" } },
          { name: "customerType", in: "query", schema: { type: "string" } },
          limitParameter
        ],
        schemaRef: "#/components/schemas/Customer",
        responseDescription: "Customer rows"
      }),
      "/api/integrations/v1/master/suppliers": getListPath({
        summary: "List supplier master rows and primary product links",
        tag: "Master Data",
        parameters: [{ name: "q", in: "query", schema: { type: "string" } }, limitParameter],
        schemaRef: "#/components/schemas/Supplier",
        responseDescription: "Supplier rows"
      }),
      "/api/integrations/v1/master/tender-methods": getListPath({
        summary: "List tender methods and payment gateway metadata",
        tag: "Master Data",
        parameters: [
          { name: "paymentMethod", in: "query", schema: { type: "string" } },
          { name: "gatewayOnly", in: "query", schema: { type: "boolean" } },
          limitParameter
        ],
        schemaRef: "#/components/schemas/TenderMethod",
        responseDescription: "Tender method rows"
      }),
      "/api/integrations/v1/sales/transactions": getListPath({
        summary: "List completed POS transactions with lines and tenders",
        tag: "Sales",
        parameters: [...dateRangeParameters, shopParameter, limitParameter],
        schemaRef: "#/components/schemas/SalesTransaction",
        responseDescription: "Completed sales transactions"
      }),
      "/api/integrations/v1/purchases/purchase-orders": getListPath({
        summary: "List purchase orders with commercial charges and lines",
        tag: "Purchasing",
        parameters: [
          ...dateRangeParameters,
          shopParameter,
          { name: "supplierNo", in: "query", schema: { type: "string" } },
          { name: "status", in: "query", schema: { type: "string" } },
          limitParameter
        ],
        schemaRef: "#/components/schemas/PurchaseOrder",
        responseDescription: "Purchase order rows"
      }),
      "/api/integrations/v1/forecast/demand": {
        get: {
          summary: "List model-scored demand forecast and reorder signals",
          tags: ["Forecast"],
          parameters: [
            shopParameter,
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 300 } }
          ],
          responses: {
            "200": {
              description: "Demand forecast rows",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      currencyCode: { type: "string" },
                      data: {
                        type: "array",
                        items: { $ref: "#/components/schemas/DemandForecastRow" }
                      },
                      summary: { type: "object" },
                      refreshedAt: { type: "string", format: "date-time" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/api/integrations/v1/finance/gl-journal": {
        get: {
          summary: "List HQ GL journals, lines, and trial balance",
          tags: ["Finance"],
          parameters: [...dateRangeParameters, shopParameter],
          responses: {
            "200": {
              description: "GL journal export",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/GlJournalExport" }
                }
              }
            }
          }
        }
      },
      "/api/integrations/v1/finance/operating-expenses": {
        get: {
          summary: "List operating expenses available for GL posting",
          tags: ["Finance"],
          parameters: [
            ...dateRangeParameters,
            shopParameter,
            { name: "status", in: "query", schema: { type: "string" } },
            limitParameter
          ],
          responses: listResponse(
            "#/components/schemas/OperatingExpense",
            "Operating expense rows"
          )
        },
        post: {
          summary: "Import an approved operating expense",
          tags: ["Finance"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OperatingExpenseCreateRequest" }
              }
            }
          },
          responses: {
            "201": {
              description: "Created operating expense",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/OperatingExpense" }
                }
              }
            }
          }
        }
      },
      "/api/system/database-readiness": {
        get: {
          summary: "Check enterprise database migration and schema readiness",
          tags: ["System"],
          security: [],
          responses: {
            "200": {
              description: "The enterprise database is ready for HQ and sync workloads",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DatabaseReadiness" }
                }
              }
            },
            "503": {
              description: "The enterprise database is missing migrations, tables, or columns",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/DatabaseReadiness" }
                }
              }
            }
          }
        }
      }
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description:
            "Use FLASH_ERP_INTEGRATION_API_KEY or a comma-separated key from FLASH_ERP_INTEGRATION_API_KEYS."
        },
        apiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key"
        }
      },
      schemas: {
        InventoryLedgerEntry: {
          type: "object",
          properties: {
            ledgerEntryId: { type: "string" },
            movementType: { type: "string" },
            quantity: { type: "number" },
            unitCost: { type: "number", nullable: true },
            productCode: { type: "string" },
            productName: { type: "string" },
            storeCode: { type: "string", nullable: true },
            locationCode: { type: "string" },
            referenceType: { type: "string" },
            referenceId: { type: "string" },
            occurredAt: { type: "string", format: "date-time" }
          }
        },
        PriceRow: {
          type: "object",
          properties: {
            priceListCode: { type: "string" },
            priceListName: { type: "string" },
            currencyCode: { type: "string" },
            isDefault: { type: "boolean" },
            customerType: { type: "string", nullable: true },
            loyaltyTier: { type: "string", nullable: true },
            productCode: { type: "string" },
            productName: { type: "string" },
            unitPrice: { type: "number" },
            updatedAt: { type: "string", format: "date-time" }
          }
        },
        Customer: {
          type: "object",
          properties: {
            customerNo: { type: "string" },
            customerType: { type: "string" },
            fullName: { type: "string" },
            phone: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            loyaltyTier: { type: "string", nullable: true },
            receivableBalanceAmount: { type: "number" },
            status: { type: "string" }
          }
        },
        Supplier: {
          type: "object",
          properties: {
            supplierNo: { type: "string" },
            supplierName: { type: "string" },
            contactName: { type: "string", nullable: true },
            leadTimeDays: { type: "integer", nullable: true },
            primaryProducts: { type: "array", items: { type: "object" } },
            status: { type: "string" }
          }
        },
        TenderMethod: {
          type: "object",
          properties: {
            tenderMethodCode: { type: "string" },
            tenderMethodName: { type: "string" },
            paymentMethod: { type: "string" },
            gatewayProvider: { type: "string", nullable: true },
            gatewayMode: { type: "string", nullable: true },
            gatewayActive: { type: "boolean" },
            gatewayStatus: { type: "string" },
            requiresReference: { type: "boolean" }
          }
        },
        SalesTransaction: {
          type: "object",
          properties: {
            transactionNo: { type: "string" },
            transactionType: { type: "string" },
            completedAt: { type: "string", nullable: true, format: "date-time" },
            storeCode: { type: "string" },
            totalAmount: { type: "number" },
            lines: { type: "array", items: { type: "object" } },
            payments: { type: "array", items: { type: "object" } }
          }
        },
        PurchaseOrder: {
          type: "object",
          properties: {
            purchaseOrderNo: { type: "string" },
            status: { type: "string" },
            supplierNo: { type: "string", nullable: true },
            storeCode: { type: "string", nullable: true },
            grandTotalAmount: { type: "number" },
            lines: { type: "array", items: { type: "object" } }
          }
        },
        DemandForecastRow: {
          type: "object",
          properties: {
            predictionId: { type: "string" },
            severity: { type: "string" },
            storeCode: { type: "string" },
            productCode: { type: "string" },
            productName: { type: "string" },
            forecastDailyDemand: { type: "number" },
            forecast14DayDemand: { type: "number" },
            forecast30DayDemand: { type: "number" },
            demandTrendPercent: { type: "number" },
            demandConfidence: { type: "number" },
            demandSignal: { type: "string" },
            recommendedQuantity: { type: "number" },
            estimatedOrderValue: { type: "number" }
          }
        },
        GlJournalExport: {
          type: "object",
          properties: {
            currencyCode: { type: "string" },
            filters: { type: "object" },
            journals: { type: "array", items: { type: "object" } },
            lines: { type: "array", items: { type: "object" } },
            trialBalance: { type: "array", items: { type: "object" } },
            postingCoverage: { type: "array", items: { type: "object" } },
            metrics: { type: "object" },
            refreshedAt: { type: "string", format: "date-time" }
          }
        },
        OperatingExpense: {
          type: "object",
          properties: {
            expenseNo: { type: "string" },
            expenseDate: { type: "string", format: "date-time" },
            storeCode: { type: "string", nullable: true },
            category: { type: "string" },
            description: { type: "string" },
            supplierName: { type: "string", nullable: true },
            paymentMethod: { type: "string", nullable: true },
            amount: { type: "number" },
            taxAmount: { type: "number" },
            totalAmount: { type: "number" },
            status: { type: "string" }
          }
        },
        OperatingExpenseCreateRequest: {
          type: "object",
          required: ["category", "description", "amount"],
          properties: {
            expenseNo: { type: "string" },
            expenseDate: { type: "string", format: "date" },
            storeCode: { type: "string" },
            category: { type: "string" },
            description: { type: "string" },
            supplierName: { type: "string" },
            paymentMethod: { type: "string" },
            externalReference: { type: "string" },
            amount: { type: "number" },
            taxAmount: { type: "number" },
            status: { type: "string" },
            approvedBy: { type: "string" },
            note: { type: "string" }
          }
        },
        DatabaseReadiness: {
          type: "object",
          properties: {
            ready: { type: "boolean" },
            checkedAt: { type: "string", format: "date-time" },
            message: { type: "string" },
            requiredMigrationNames: { type: "array", items: { type: "string" } },
            appliedMigrationNames: { type: "array", items: { type: "string" } },
            missingMigrationNames: { type: "array", items: { type: "string" } },
            missingTables: { type: "array", items: { type: "string" } },
            missingColumns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  tableName: { type: "string" },
                  columnName: { type: "string" }
                }
              }
            },
            issues: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  severity: { type: "string" },
                  message: { type: "string" },
                  remediation: { type: "string" }
                }
              }
            }
          }
        }
      }
    }
  };
}
