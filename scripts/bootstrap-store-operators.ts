import path from "node:path";

import dotenv from "dotenv";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  securityPermissionCatalog,
  SyncNodeType,
  UserAccountStatus
} from "@flash-erp/domain";

if (!process.env.DATABASE_URL) {
  dotenv.config({
    path: path.resolve(process.cwd(), ".env")
  });
}

const datasourceUrl = process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before bootstrapping Flash ERP store operators.");
}

function serializeJsonField(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

const defaultStoreCode = process.env.FLASH_ERP_BOOTSTRAP_STORE_CODE?.trim() || "accra-central";

function normalizeStorePrefix(storeCode: string) {
  return storeCode.replace(/[^a-z0-9]+/gi, ".").replace(/^\.+|\.+$/g, "");
}

const cashierPermissionCodes = [
  "pos.shift.open",
  "pos.shift.close",
  "pos.sale.process",
  "pos.return.process",
  "pos.exchange.process",
  "pos.receipt.search",
  "pos.receipt.reprint",
  "pos.customer.attach",
  "pos.customer.account.collect",
  "pos.loyalty.redeem"
] as const;

const supervisorPermissionCodes = [
  ...cashierPermissionCodes,
  "pos.override.no-receipt-return",
  "pos.override.discount",
  "pos.override.price",
  "inventory.view",
  "inventory.adjust",
  "inventory.count.submit",
  "inventory.count.commit",
  "inventory.transfer.request",
  "inventory.transfer.issue",
  "inventory.transfer.receive",
  "inventory.grn.receive",
  "inventory.supplier-return.manage"
] as const;

const onlineCashierPermissionCodes = [
  ...cashierPermissionCodes,
  "inventory.view",
  "inventory.transfer.request"
] as const;

const onlineSupervisorPermissionCodes = [
  ...supervisorPermissionCodes
] as const;

async function ensurePermissionCatalog() {
  for (const permission of securityPermissionCatalog) {
    await prisma.permission.upsert({
      where: {
        code: permission.code
      },
      update: {
        name: permission.name,
        description: permission.description
      },
      create: {
        code: permission.code,
        name: permission.name,
        description: permission.description
      }
    });
  }
}

async function ensureEnterpriseNode() {
  const enterpriseNode = await prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          code: true,
          name: true
        }
      }
    }
  });

  if (!enterpriseNode) {
    throw new Error(
      "Flash ERP could not find the primary enterprise node. Bootstrap the enterprise admin first."
    );
  }

  return enterpriseNode;
}

async function ensureStore(retailOrgId: string, storeCode: string) {
  const store = await prisma.store.findFirst({
    where: {
      retailOrgId,
      code: storeCode,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeMode: true
    }
  });

  if (!store) {
    throw new Error(`Flash ERP could not find active store "${storeCode}" for operator bootstrap.`);
  }

  return store;
}

async function listOnlineDirectStores(retailOrgId: string) {
  return prisma.store.findMany({
    where: {
      retailOrgId,
      storeMode: "ONLINE_DIRECT",
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      storeMode: true
    },
    orderBy: [
      {
        name: "asc"
      },
      {
        code: "asc"
      }
    ]
  });
}

async function ensureRoleWithPermissions(input: {
  retailOrgId: string;
  code: string;
  name: string;
  description: string;
  permissionCodes: string[];
}) {
  const role = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId: input.retailOrgId,
        code: input.code
      }
    },
    update: {
      name: input.name,
      description: input.description,
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId: input.retailOrgId,
      code: input.code,
      name: input.name,
      description: input.description,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true
    }
  });

  const permissions = await prisma.permission.findMany({
    where: {
      code: {
        in: input.permissionCodes
      }
    },
    select: {
      id: true,
      code: true
    }
  });

  if (permissions.length !== input.permissionCodes.length) {
    const resolvedCodes = new Set(permissions.map((permission) => permission.code));
    const missingCodes = input.permissionCodes.filter((permissionCode) => !resolvedCodes.has(permissionCode));
    throw new Error(
      `Flash ERP could not resolve role permission code(s): ${missingCodes.join(", ")}.`
    );
  }

  await prisma.rolePermission.deleteMany({
    where: {
      roleId: role.id
    }
  });

  await prisma.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: role.id,
      permissionId: permission.id
    }))
  });

  return role;
}

async function upsertStoreUser(input: {
  retailOrgId: string;
  enterpriseNodeCode: string;
  homeStoreId: string;
  loginId: string;
  email: string;
  displayName: string;
  password: string;
  roleIds: string[];
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma.retailUser.upsert({
    where: {
      retailOrgId_loginId: {
        retailOrgId: input.retailOrgId,
        loginId: input.loginId
      }
    },
    update: {
      homeStoreId: input.homeStoreId,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      accountStatus: UserAccountStatus.ACTIVE,
      deletedAt: null,
      originNodeCode: input.enterpriseNodeCode,
      lastModifiedByNodeCode: input.enterpriseNodeCode
    },
    create: {
      retailOrgId: input.retailOrgId,
      homeStoreId: input.homeStoreId,
      loginId: input.loginId,
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      accountStatus: UserAccountStatus.ACTIVE,
      originNodeCode: input.enterpriseNodeCode,
      lastModifiedByNodeCode: input.enterpriseNodeCode
    },
    select: {
      id: true,
      loginId: true,
      displayName: true
    }
  });

  await prisma.retailUserRole.deleteMany({
    where: {
      retailUserId: user.id
    }
  });

  await prisma.retailUserRole.createMany({
    data: input.roleIds.map((roleId) => ({
      retailUserId: user.id,
      roleId
    }))
  });

  await prisma.retailUserSession.updateMany({
    where: {
      retailUserId: user.id,
      revokedAt: null
    },
    data: {
      revokedAt: new Date()
    }
  });

  return user;
}

async function writeBootstrapLog(input: {
  retailOrgId: string;
  sourceNodeCode: string;
  targetRef: string;
  message: string;
  details: Record<string, unknown>;
}) {
  await prisma.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "USER",
      action: "BOOTSTRAP_STORE_OPERATOR",
      actorLabel: "Bootstrap script",
      targetType: "Retail user",
      targetRef: input.targetRef,
      sourceNodeCode: input.sourceNodeCode,
      message: input.message,
      detailsJson: serializeJsonField(input.details)
    }
  });
}

async function upsertOnlineStoreOperators(input: {
  retailOrgId: string;
  enterpriseNodeCode: string;
  store: Awaited<ReturnType<typeof ensureStore>>;
  cashierRole: Awaited<ReturnType<typeof ensureRoleWithPermissions>>;
  supervisorRole: Awaited<ReturnType<typeof ensureRoleWithPermissions>>;
  cashierPassword: string;
  supervisorPassword: string;
  allowLoginEnvOverrides: boolean;
}) {
  const normalizedStorePrefix = normalizeStorePrefix(input.store.code);
  const cashierLoginId =
    (input.allowLoginEnvOverrides && process.env.FLASH_ERP_BOOTSTRAP_ONLINE_CASHIER_LOGIN?.trim()) ||
    `${normalizedStorePrefix}.online.cashier`;
  const supervisorLoginId =
    (input.allowLoginEnvOverrides &&
      process.env.FLASH_ERP_BOOTSTRAP_ONLINE_SUPERVISOR_LOGIN?.trim()) ||
    `${normalizedStorePrefix}.online.supervisor`;

  const cashierUser = await upsertStoreUser({
    retailOrgId: input.retailOrgId,
    enterpriseNodeCode: input.enterpriseNodeCode,
    homeStoreId: input.store.id,
    loginId: cashierLoginId,
    email: `${cashierLoginId}@flashrms.local`,
    displayName: `${input.store.name} Online Cashier`,
    password: input.cashierPassword,
    roleIds: [input.cashierRole.id]
  });

  const supervisorUser = await upsertStoreUser({
    retailOrgId: input.retailOrgId,
    enterpriseNodeCode: input.enterpriseNodeCode,
    homeStoreId: input.store.id,
    loginId: supervisorLoginId,
    email: `${supervisorLoginId}@flashrms.local`,
    displayName: `${input.store.name} Online Supervisor`,
    password: input.supervisorPassword,
    roleIds: [input.supervisorRole.id]
  });

  await writeBootstrapLog({
    retailOrgId: input.retailOrgId,
    sourceNodeCode: input.enterpriseNodeCode,
    targetRef: cashierUser.loginId,
    message: `Bootstrap online cashier ${cashierUser.loginId} was created or reset for ${input.store.code}.`,
    details: {
      storeCode: input.store.code,
      roleCode: input.cashierRole.code
    }
  });

  await writeBootstrapLog({
    retailOrgId: input.retailOrgId,
    sourceNodeCode: input.enterpriseNodeCode,
    targetRef: supervisorUser.loginId,
    message: `Bootstrap online supervisor ${supervisorUser.loginId} was created or reset for ${input.store.code}.`,
    details: {
      storeCode: input.store.code,
      roleCode: input.supervisorRole.code
    }
  });

  return {
    storeCode: input.store.code,
    storeName: input.store.name,
    cashierLoginId,
    cashierPassword: input.cashierPassword,
    supervisorLoginId,
    supervisorPassword: input.supervisorPassword,
    cashierRoleCode: input.cashierRole.code,
    supervisorRoleCode: input.supervisorRole.code
  };
}

async function main() {
  await ensurePermissionCatalog();

  const enterpriseNode = await ensureEnterpriseNode();
  const store = await ensureStore(enterpriseNode.retailOrgId, defaultStoreCode);
  const normalizedStorePrefix = normalizeStorePrefix(store.code);

  const cashierRole = await ensureRoleWithPermissions({
    retailOrgId: enterpriseNode.retailOrgId,
    code: "STORE_CASHIER",
    name: "Store Cashier",
    description: "Cashier lane role for Flash ERP store desktops.",
    permissionCodes: [...cashierPermissionCodes]
  });

  const supervisorRole = await ensureRoleWithPermissions({
    retailOrgId: enterpriseNode.retailOrgId,
    code: "STORE_SUPERVISOR",
    name: "Store Supervisor",
    description: "Supervisor and store operations role for Flash ERP desktops.",
    permissionCodes: [...supervisorPermissionCodes]
  });

  const onlineCashierRole = await ensureRoleWithPermissions({
    retailOrgId: enterpriseNode.retailOrgId,
    code: "ONLINE_STORE_CASHIER",
    name: "Online Store Cashier",
    description: "Browser POS cashier role for Flash ERP online-direct stores.",
    permissionCodes: [...onlineCashierPermissionCodes]
  });

  const onlineSupervisorRole = await ensureRoleWithPermissions({
    retailOrgId: enterpriseNode.retailOrgId,
    code: "ONLINE_STORE_SUPERVISOR",
    name: "Online Store Supervisor",
    description: "Browser POS supervisor role for Flash ERP online-direct stores.",
    permissionCodes: [...onlineSupervisorPermissionCodes]
  });

  const cashierLoginId =
    process.env.FLASH_ERP_BOOTSTRAP_CASHIER_LOGIN?.trim() || `${normalizedStorePrefix}.cashier`;
  const cashierPassword =
    process.env.FLASH_ERP_BOOTSTRAP_CASHIER_PASSWORD?.trim() || "FlashERPCashier2026Aa11";
  const supervisorLoginId =
    process.env.FLASH_ERP_BOOTSTRAP_SUPERVISOR_LOGIN?.trim() ||
    `${normalizedStorePrefix}.supervisor`;
  const supervisorPassword =
    process.env.FLASH_ERP_BOOTSTRAP_SUPERVISOR_PASSWORD?.trim() || "FlashERPSupervisor2026Aa11";
  const onlineCashierPassword =
    process.env.FLASH_ERP_BOOTSTRAP_ONLINE_CASHIER_PASSWORD?.trim() ||
    "FlashERPOnlineCashier2026Aa11";
  const onlineSupervisorPassword =
    process.env.FLASH_ERP_BOOTSTRAP_ONLINE_SUPERVISOR_PASSWORD?.trim() ||
    "FlashERPOnlineSupervisor2026Aa11";

  const cashierUser = await upsertStoreUser({
    retailOrgId: enterpriseNode.retailOrgId,
    enterpriseNodeCode: enterpriseNode.code,
    homeStoreId: store.id,
    loginId: cashierLoginId,
    email: `${cashierLoginId}@flashrms.local`,
    displayName: `${store.name} Cashier`,
    password: cashierPassword,
    roleIds: [cashierRole.id]
  });

  const supervisorUser = await upsertStoreUser({
    retailOrgId: enterpriseNode.retailOrgId,
    enterpriseNodeCode: enterpriseNode.code,
    homeStoreId: store.id,
    loginId: supervisorLoginId,
    email: `${supervisorLoginId}@flashrms.local`,
    displayName: `${store.name} Supervisor`,
    password: supervisorPassword,
    roleIds: [supervisorRole.id]
  });

  await writeBootstrapLog({
    retailOrgId: enterpriseNode.retailOrgId,
    sourceNodeCode: enterpriseNode.code,
    targetRef: cashierUser.loginId,
    message: `Bootstrap store cashier ${cashierUser.loginId} was created or reset for ${store.code}.`,
    details: {
      storeCode: store.code,
      roleCode: cashierRole.code
    }
  });

  await writeBootstrapLog({
    retailOrgId: enterpriseNode.retailOrgId,
    sourceNodeCode: enterpriseNode.code,
    targetRef: supervisorUser.loginId,
    message: `Bootstrap store supervisor ${supervisorUser.loginId} was created or reset for ${store.code}.`,
    details: {
      storeCode: store.code,
      roleCode: supervisorRole.code
    }
  });

  const onlineStores = await listOnlineDirectStores(enterpriseNode.retailOrgId);
  const allowOnlineLoginEnvOverrides = onlineStores.length <= 1;
  const hasOnlineLoginEnvOverrides = Boolean(
    process.env.FLASH_ERP_BOOTSTRAP_ONLINE_CASHIER_LOGIN?.trim() ||
      process.env.FLASH_ERP_BOOTSTRAP_ONLINE_SUPERVISOR_LOGIN?.trim()
  );

  if (!allowOnlineLoginEnvOverrides && hasOnlineLoginEnvOverrides) {
    console.warn(
      "Ignoring FLASH_ERP_BOOTSTRAP_ONLINE_*_LOGIN overrides because multiple online-direct stores need unique login ids."
    );
  }

  const onlineOperatorOutputs: Awaited<ReturnType<typeof upsertOnlineStoreOperators>>[] = [];

  for (const onlineStore of onlineStores) {
    const output = await upsertOnlineStoreOperators({
      retailOrgId: enterpriseNode.retailOrgId,
      enterpriseNodeCode: enterpriseNode.code,
      store: onlineStore,
      cashierRole: onlineCashierRole,
      supervisorRole: onlineSupervisorRole,
      cashierPassword: onlineCashierPassword,
      supervisorPassword: onlineSupervisorPassword,
      allowLoginEnvOverrides: allowOnlineLoginEnvOverrides
    });

    onlineOperatorOutputs.push(output);
  }

  console.log("Flash ERP bootstrap store operators are ready.");
  console.log(`Store: ${store.name} (${store.code})`);
  console.log(`Cashier login: ${cashierLoginId}`);
  console.log(`Cashier password: ${cashierPassword}`);
  console.log(`Supervisor login: ${supervisorLoginId}`);
  console.log(`Supervisor password: ${supervisorPassword}`);
  console.log(`Cashier role: ${cashierRole.code}`);
  console.log(`Supervisor role: ${supervisorRole.code}`);
  if (onlineOperatorOutputs.length > 0) {
    console.log("Online-direct store operators:");

    for (const onlineOperatorOutput of onlineOperatorOutputs) {
      console.log(`Online store: ${onlineOperatorOutput.storeName} (${onlineOperatorOutput.storeCode})`);
      console.log(`Online cashier login: ${onlineOperatorOutput.cashierLoginId}`);
      console.log(`Online cashier password: ${onlineOperatorOutput.cashierPassword}`);
      console.log(`Online supervisor login: ${onlineOperatorOutput.supervisorLoginId}`);
      console.log(`Online supervisor password: ${onlineOperatorOutput.supervisorPassword}`);
      console.log(`Online cashier role: ${onlineOperatorOutput.cashierRoleCode}`);
      console.log(`Online supervisor role: ${onlineOperatorOutput.supervisorRoleCode}`);
    }
  } else {
    console.log("Online-direct store operators: no active ONLINE_DIRECT stores found.");
  }
  console.log("Next desktop step: run a store sync cycle so the local desktop snapshot receives the desktop operators.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
