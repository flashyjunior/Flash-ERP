import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  defaultAccountPaymentReceiptTemplateHtml,
  defaultGoodsReceiptTemplateHtml,
  defaultPurchaseOrderTemplateHtml,
  defaultThermalReceiptTemplateHtml
} from "@/lib/templates/thermal-receipt-templates";
import { RecordStatus } from "@flash-erp/domain";


type ReceiptTemplateClient = Prisma.TransactionClient | typeof prisma;

export type StoreReceiptTemplateSelectionInput = {
  salesReceiptTemplateHtml: string | null;
  salesReceiptTemplate:
    | {
        code: string;
        name: string;
        templateHtml: string;
        isDefault: boolean;
        updatedAt: Date;
      }
    | null
    | undefined;
};

export type StoreReceiptTemplateResolution = {
  html: string | null;
  code: string | null;
  name: string | null;
  mode: "default" | "linked" | "legacy";
  sourceLabel: string;
  isDefault: boolean;
  versionAt: Date | null;
};

export async function ensureEnterpriseStarterReceiptTemplate(
  client: ReceiptTemplateClient,
  retailOrgId: string
) {
  const starterCode = "thermal-sales-starter";
  const templates = await client.receiptTemplate.findMany({
    where: {
      retailOrgId
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      isDefault: true,
      status: true
    }
  });

  const existingStarterTemplate = await client.receiptTemplate.findFirst({
    where: {
      retailOrgId,
      code: starterCode
    },
    select: {
      id: true,
      name: true,
      description: true,
      templateHtml: true
    }
  });

  if (existingStarterTemplate) {
    if (
      existingStarterTemplate.templateHtml === defaultThermalReceiptTemplateHtml &&
      existingStarterTemplate.name &&
      existingStarterTemplate.description
    ) {
      return client.receiptTemplate.findUnique({
        where: {
          id: existingStarterTemplate.id
        }
      });
    }

    return client.receiptTemplate.update({
      where: {
        id: existingStarterTemplate.id
      },
      data: {
        name: existingStarterTemplate.name || "Flash ERP Thermal Starter",
        description:
          existingStarterTemplate.description ??
          "SMS-style 80mm sales receipt starter template for Flash ERP stores and warehouse desktops.",
        templateHtml: defaultThermalReceiptTemplateHtml
      }
    });
  }

  if (templates.length === 0) {
    return client.receiptTemplate.create({
      data: {
        retailOrgId,
        code: starterCode,
        name: "Flash ERP Thermal Starter",
        description:
          "SMS-style 80mm sales receipt starter template for Flash ERP stores and warehouse desktops.",
        templateHtml: defaultThermalReceiptTemplateHtml,
        isDefault: true,
        paperWidthMm: 80,
        status: RecordStatus.ACTIVE
      }
    });
  }

  const existingDefault = templates.find((template) => template.isDefault);

  if (existingDefault) {
    return client.receiptTemplate.findUnique({
      where: {
        id: existingDefault.id
      }
    });
  }

  const templateToPromote =
    templates.find((template) => template.status === RecordStatus.ACTIVE) ?? templates[0];

  return client.receiptTemplate.update({
    where: {
      id: templateToPromote.id
    },
    data: {
      isDefault: true
    }
  });
}

export async function ensureEnterpriseAccountPaymentReceiptTemplate(
  client: ReceiptTemplateClient,
  retailOrgId: string
) {
  const starterCode = "thermal-account-payment-starter";
  const existingTemplate = await client.receiptTemplate.findFirst({
    where: {
      retailOrgId,
      code: starterCode
    },
    select: {
      id: true,
      name: true,
      description: true,
      templateHtml: true
    }
  });

  if (existingTemplate) {
    if (
      existingTemplate.templateHtml === defaultAccountPaymentReceiptTemplateHtml &&
      existingTemplate.name &&
      existingTemplate.description
    ) {
      return client.receiptTemplate.findUnique({
        where: {
          id: existingTemplate.id
        }
      });
    }

    return client.receiptTemplate.update({
      where: {
        id: existingTemplate.id
      },
      data: {
        name: existingTemplate.name || "Flash ERP Account Payment Receipt",
        description:
          existingTemplate.description ??
          "Enterprise-controlled 80mm receipt template for customer account payments collected at store desktops.",
        templateHtml: defaultAccountPaymentReceiptTemplateHtml
      }
    });
  }

  return client.receiptTemplate.create({
    data: {
      retailOrgId,
      code: starterCode,
      name: "Flash ERP Account Payment Receipt",
      description:
        "Enterprise-controlled 80mm receipt template for customer account payments collected at store desktops.",
      templateHtml: defaultAccountPaymentReceiptTemplateHtml,
      isDefault: false,
      paperWidthMm: 80,
      status: RecordStatus.ACTIVE
    }
  });
}

export async function ensureEnterpriseGoodsReceiptTemplate(
  client: ReceiptTemplateClient,
  retailOrgId: string
) {
  const starterCode = "thermal-goods-receipt-starter";
  const existingTemplate = await client.receiptTemplate.findFirst({
    where: {
      retailOrgId,
      code: starterCode
    },
    select: {
      id: true,
      name: true,
      description: true,
      templateHtml: true,
      paperWidthMm: true
    }
  });

  if (existingTemplate) {
    if (
      existingTemplate.templateHtml === defaultGoodsReceiptTemplateHtml &&
      existingTemplate.name &&
      existingTemplate.description &&
      existingTemplate.paperWidthMm === 210
    ) {
      return client.receiptTemplate.findUnique({
        where: {
          id: existingTemplate.id
        }
      });
    }

    return client.receiptTemplate.update({
      where: {
        id: existingTemplate.id
      },
      data: {
        name: existingTemplate.name || "Flash ERP Goods Receipt Note",
        description:
          existingTemplate.description ??
          "Enterprise-controlled A4 goods receipt note template for shop GRN printing.",
        templateHtml: defaultGoodsReceiptTemplateHtml,
        paperWidthMm: 210
      }
    });
  }

  return client.receiptTemplate.create({
    data: {
      retailOrgId,
      code: starterCode,
      name: "Flash ERP Goods Receipt Note",
      description:
        "Enterprise-controlled A4 goods receipt note template for shop GRN printing.",
      templateHtml: defaultGoodsReceiptTemplateHtml,
      isDefault: false,
      paperWidthMm: 210,
      status: RecordStatus.ACTIVE
    }
  });
}

export async function ensureEnterprisePurchaseOrderTemplate(
  client: ReceiptTemplateClient,
  retailOrgId: string
) {
  const starterCode = "a4-purchase-order-starter";
  const existingTemplate = await client.receiptTemplate.findFirst({
    where: {
      retailOrgId,
      code: starterCode
    },
    select: {
      id: true,
      name: true,
      description: true,
      templateHtml: true,
      paperWidthMm: true
    }
  });

  if (existingTemplate) {
    if (
      existingTemplate.templateHtml === defaultPurchaseOrderTemplateHtml &&
      existingTemplate.name &&
      existingTemplate.description &&
      existingTemplate.paperWidthMm === 210
    ) {
      return client.receiptTemplate.findUnique({
        where: {
          id: existingTemplate.id
        }
      });
    }

    return client.receiptTemplate.update({
      where: {
        id: existingTemplate.id
      },
      data: {
        name: existingTemplate.name || "Flash ERP Purchase Order",
        description:
          existingTemplate.description ??
          "Enterprise-controlled A4 purchase order template for HQ PO printing.",
        templateHtml: defaultPurchaseOrderTemplateHtml,
        paperWidthMm: 210
      }
    });
  }

  return client.receiptTemplate.create({
    data: {
      retailOrgId,
      code: starterCode,
      name: "Flash ERP Purchase Order",
      description: "Enterprise-controlled A4 purchase order template for HQ PO printing.",
      templateHtml: defaultPurchaseOrderTemplateHtml,
      isDefault: false,
      paperWidthMm: 210,
      status: RecordStatus.ACTIVE
    }
  });
}

export function resolveStoreReceiptTemplateSelection(
  input: StoreReceiptTemplateSelectionInput
): StoreReceiptTemplateResolution {
  if (input.salesReceiptTemplate) {
    return {
      html: input.salesReceiptTemplate.templateHtml,
      code: input.salesReceiptTemplate.code,
      name: input.salesReceiptTemplate.name,
      mode: "linked",
      sourceLabel: input.salesReceiptTemplate.isDefault
        ? `${input.salesReceiptTemplate.name} (enterprise default)`
        : input.salesReceiptTemplate.name,
      isDefault: input.salesReceiptTemplate.isDefault,
      versionAt: input.salesReceiptTemplate.updatedAt
    };
  }

  if (input.salesReceiptTemplateHtml?.trim()) {
    return {
      html: input.salesReceiptTemplateHtml,
      code: null,
      name: null,
      mode: "legacy",
      sourceLabel: "Legacy store-specific HTML template",
      isDefault: false,
      versionAt: null
    };
  }

  return {
    html: defaultThermalReceiptTemplateHtml,
    code: null,
    name: "Flash ERP Thermal Starter",
    mode: "default",
    sourceLabel: "Flash ERP built-in thermal slip",
    isDefault: false,
    versionAt: null
  };
}
