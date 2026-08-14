import path from "node:path";

import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

import { SecurityLogKind, SecurityLogSeverity } from "@flash-erp/domain";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
}

const datasourceUrl = process.env.DATABASE_URL;
if (!datasourceUrl) {
  throw new Error("DATABASE_URL must be set before managing the capacity test user.");
}

const action = process.env.FLASH_ERP_CAPACITY_TEST_USER_ACTION?.trim().toLowerCase();
if (action !== "provision" && action !== "disable") {
  throw new Error(
    'Set FLASH_ERP_CAPACITY_TEST_USER_ACTION to either "provision" or "disable".'
  );
}

const loginId = process.env.FLASH_ERP_CAPACITY_TEST_LOGIN?.trim() || "capacity.read";
const roleCode = "CAPACITY_READ_ONLY";
const permissionCodes = [
  "operations.dashboard.view",
  "inventory.view",
  "master.product.manage"
];
const prisma = new PrismaClient({ adapter: new PrismaMssql(datasourceUrl) });

async function enterpriseNode() {
  const node = await prisma.syncNode.findFirst({
    where: {
      nodeType: "ENTERPRISE",
      status: "ACTIVE"
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      code: true,
      retailOrgId: true
    }
  });

  if (!node) throw new Error("No active enterprise sync node is available.");
  return node;
}

async function provision() {
  const password = process.env.FLASH_ERP_CAPACITY_TEST_PASSWORD ?? "";
  if (password.length < 24 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^\w\s]/.test(password)) {
    throw new Error(
      "The capacity test password must have at least 24 characters with upper, lower, digit, and symbol characters."
    );
  }

  const node = await enterpriseNode();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction(async (tx) => {
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: permissionCodes }
      },
      select: { id: true, code: true }
    });
    if (permissions.length !== permissionCodes.length) {
      const available = new Set(permissions.map((permission) => permission.code));
      const missing = permissionCodes.filter((code) => !available.has(code));
      throw new Error(`Missing capacity-test permission code(s): ${missing.join(", ")}.`);
    }

    const role = await tx.role.upsert({
      where: {
        retailOrgId_code: {
          retailOrgId: node.retailOrgId,
          code: roleCode
        }
      },
      update: {
        name: "Capacity test read only",
        description: "Temporary least-privilege role for GET-only enterprise capacity tests.",
        status: "ACTIVE"
      },
      create: {
        retailOrgId: node.retailOrgId,
        code: roleCode,
        name: "Capacity test read only",
        description: "Temporary least-privilege role for GET-only enterprise capacity tests.",
        status: "ACTIVE"
      },
      select: { id: true }
    });
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: role.id,
        permissionId: permission.id
      }))
    });

    const user = await tx.retailUser.upsert({
      where: {
        retailOrgId_loginId: {
          retailOrgId: node.retailOrgId,
          loginId
        }
      },
      update: {
        displayName: "Enterprise Capacity Test",
        email: null,
        homeStoreId: null,
        passwordHash,
        passwordUpdatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        accountStatus: "ACTIVE",
        deletedAt: null,
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code
      },
      create: {
        retailOrgId: node.retailOrgId,
        loginId,
        displayName: "Enterprise Capacity Test",
        passwordHash,
        passwordUpdatedAt: new Date(),
        accountStatus: "ACTIVE",
        originNodeCode: node.code,
        lastModifiedByNodeCode: node.code
      },
      select: { id: true }
    });
    await tx.retailUserRole.deleteMany({ where: { retailUserId: user.id } });
    await tx.retailUserRole.create({
      data: {
        retailUserId: user.id,
        roleId: role.id
      }
    });
    await tx.retailUserSession.updateMany({
      where: { retailUserId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.securityLog.create({
      data: {
        retailOrgId: node.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "CAPACITY",
        action: "TEST_USER_PROVISION",
        actorLabel: "Capacity test helper",
        targetType: "Retail user",
        targetRef: loginId,
        sourceNodeCode: node.code,
        message: `Provisioned temporary GET-only capacity test user ${loginId}.`,
        detailsJson: JSON.stringify({ roleCode, permissionCodes })
      }
    });
  });

  process.stdout.write(`Capacity test user ${loginId} is active.\n`);
}

async function disable() {
  const node = await enterpriseNode();

  await prisma.$transaction(async (tx) => {
    const user = await tx.retailUser.findUnique({
      where: {
        retailOrgId_loginId: {
          retailOrgId: node.retailOrgId,
          loginId
        }
      },
      select: { id: true }
    });
    const role = await tx.role.findUnique({
      where: {
        retailOrgId_code: {
          retailOrgId: node.retailOrgId,
          code: roleCode
        }
      },
      select: { id: true }
    });

    if (user) {
      await tx.retailUserSession.updateMany({
        where: { retailUserId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      });
      await tx.retailUserRole.deleteMany({ where: { retailUserId: user.id } });
      await tx.retailUser.update({
        where: { id: user.id },
        data: {
          passwordHash: null,
          passwordUpdatedAt: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          accountStatus: "DISABLED",
          lastModifiedByNodeCode: node.code
        }
      });
    }
    if (role) {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      await tx.role.update({ where: { id: role.id }, data: { status: "INACTIVE" } });
    }
    await tx.securityLog.create({
      data: {
        retailOrgId: node.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        severity: SecurityLogSeverity.INFO,
        category: "CAPACITY",
        action: "TEST_USER_DISABLE",
        actorLabel: "Capacity test helper",
        targetType: "Retail user",
        targetRef: loginId,
        sourceNodeCode: node.code,
        message: `Disabled capacity test user ${loginId} and removed its credential and role assignments.`
      }
    });
  });

  process.stdout.write(`Capacity test user ${loginId} is disabled.\n`);
}

async function main() {
  if (action === "provision") await provision();
  else await disable();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    await prisma.$disconnect();
    process.exit(1);
  });
