import crypto from "node:crypto";
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
  throw new Error("DATABASE_URL must be set before bootstrapping the Flash ERP admin user.");
}

const prisma = new PrismaClient({
  adapter: new PrismaMssql(datasourceUrl)
});

function serializeJsonField(value: unknown) {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

type PasswordPolicySettings = {
  minimumLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  expiryDays: number;
  historyCount: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  sessionTimeoutMinutes: number;
};

const defaultPasswordPolicy: PasswordPolicySettings = {
  minimumLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSymbol: false,
  expiryDays: 90,
  historyCount: 4,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  sessionTimeoutMinutes: 30
};

function readPasswordPolicy(value: unknown): PasswordPolicySettings {
  const payload =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const readNumber = (key: keyof PasswordPolicySettings, fallback: number) => {
    const candidate = payload[key];
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
  };

  const readBoolean = (key: keyof PasswordPolicySettings, fallback: boolean) => {
    const candidate = payload[key];
    return typeof candidate === "boolean" ? candidate : fallback;
  };

  return {
    minimumLength: readNumber("minimumLength", defaultPasswordPolicy.minimumLength),
    requireUppercase: readBoolean("requireUppercase", defaultPasswordPolicy.requireUppercase),
    requireLowercase: readBoolean("requireLowercase", defaultPasswordPolicy.requireLowercase),
    requireDigit: readBoolean("requireDigit", defaultPasswordPolicy.requireDigit),
    requireSymbol: readBoolean("requireSymbol", defaultPasswordPolicy.requireSymbol),
    expiryDays: readNumber("expiryDays", defaultPasswordPolicy.expiryDays),
    historyCount: readNumber("historyCount", defaultPasswordPolicy.historyCount),
    maxFailedAttempts: readNumber("maxFailedAttempts", defaultPasswordPolicy.maxFailedAttempts),
    lockoutMinutes: readNumber("lockoutMinutes", defaultPasswordPolicy.lockoutMinutes),
    sessionTimeoutMinutes: readNumber(
      "sessionTimeoutMinutes",
      defaultPasswordPolicy.sessionTimeoutMinutes
    )
  };
}

function validatePasswordPolicy(password: string, policy: PasswordPolicySettings) {
  if (password.length < policy.minimumLength) {
    throw new Error(
      `Bootstrap password must be at least ${policy.minimumLength} character(s) long.`
    );
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new Error("Bootstrap password must include at least one uppercase letter.");
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new Error("Bootstrap password must include at least one lowercase letter.");
  }

  if (policy.requireDigit && !/[0-9]/.test(password)) {
    throw new Error("Bootstrap password must include at least one digit.");
  }

  if (policy.requireSymbol && !/[^\w\s]/.test(password)) {
    throw new Error("Bootstrap password must include at least one symbol.");
  }
}

function generateBootstrapPassword(policy: PasswordPolicySettings) {
  const segments = ["Flash", "RMS", "Admin", new Date().getUTCFullYear().toString()];
  let password = `${segments.join("")}Aa9`;

  if (policy.requireSymbol) {
    password += "!";
  }

  password += crypto.randomBytes(4).toString("hex").toUpperCase();

  while (password.length < policy.minimumLength) {
    password += "x7";
  }

  validatePasswordPolicy(password, policy);
  return password;
}

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
  const existing = await prisma.syncNode.findFirst({
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
          name: true,
          passwordPolicyJson: true
        }
      }
    }
  });

  if (existing) {
    return existing;
  }

  const retailOrg = await prisma.retailOrg.upsert({
    where: {
      code: "flash-retail"
    },
    update: {
      name: "Flash Retail",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "GHS",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      status: RecordStatus.ACTIVE
    },
    create: {
      code: "flash-retail",
      name: "Flash Retail",
      baseCurrencyCode: process.env.FLASH_ERP_DEFAULT_CURRENCY ?? "GHS",
      timezone: process.env.FLASH_ERP_DEFAULT_TIMEZONE ?? "Africa/Accra",
      status: RecordStatus.ACTIVE
    }
  });

  await prisma.syncNode.upsert({
    where: {
      code: "enterprise-primary"
    },
    update: {
      retailOrgId: retailOrg.id,
      name: "Enterprise Primary",
      nodeType: SyncNodeType.ENTERPRISE,
      direction: "BIDIRECTIONAL",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
      lastHeartbeatAt: new Date()
    },
    create: {
      retailOrgId: retailOrg.id,
      code: "enterprise-primary",
      name: "Enterprise Primary",
      nodeType: SyncNodeType.ENTERPRISE,
      direction: "BIDIRECTIONAL",
      isPrimary: true,
      status: RecordStatus.ACTIVE,
      lastHeartbeatAt: new Date()
    }
  });

  const created = await prisma.syncNode.findFirst({
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
          name: true,
          passwordPolicyJson: true
        }
      }
    }
  });

  if (!created) {
    throw new Error("Flash ERP could not create the primary enterprise node.");
  }

  return created;
}

async function ensureHqAdminRole(retailOrgId: string) {
  const role = await prisma.role.upsert({
    where: {
      retailOrgId_code: {
        retailOrgId,
        code: "HQ_ADMIN"
      }
    },
    update: {
      name: "HQ Admin",
      description: "Bootstrap enterprise administrator with full Flash ERP access.",
      status: RecordStatus.ACTIVE
    },
    create: {
      retailOrgId,
      code: "HQ_ADMIN",
      name: "HQ Admin",
      description: "Bootstrap enterprise administrator with full Flash ERP access.",
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true
    }
  });

  const permissions = await prisma.permission.findMany({
    where: {
      code: {
        in: securityPermissionCatalog.map((permission) => permission.code)
      }
    },
    select: {
      id: true
    }
  });

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

async function main() {
  await ensurePermissionCatalog();

  const enterpriseNode = await ensureEnterpriseNode();
  const passwordPolicy = readPasswordPolicy(enterpriseNode.retailOrg.passwordPolicyJson);
  const loginId = process.env.FLASH_ERP_BOOTSTRAP_ADMIN_LOGIN?.trim() || "hq.admin";
  const displayName =
    process.env.FLASH_ERP_BOOTSTRAP_ADMIN_NAME?.trim() || "Flash ERP Enterprise Admin";
  const email =
    process.env.FLASH_ERP_BOOTSTRAP_ADMIN_EMAIL?.trim() || "hq.admin@flashrms.local";
  const password =
    process.env.FLASH_ERP_BOOTSTRAP_ADMIN_PASSWORD?.trim() ||
    generateBootstrapPassword(passwordPolicy);

  validatePasswordPolicy(password, passwordPolicy);

  const passwordHash = await bcrypt.hash(password, 12);
  const hqRole = await ensureHqAdminRole(enterpriseNode.retailOrgId);

  const user = await prisma.retailUser.upsert({
    where: {
      retailOrgId_loginId: {
        retailOrgId: enterpriseNode.retailOrgId,
        loginId
      }
    },
    update: {
      loginId,
      email,
      displayName,
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      accountStatus: UserAccountStatus.ACTIVE,
      deletedAt: null,
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code
    },
    create: {
      retailOrgId: enterpriseNode.retailOrgId,
      loginId,
      email,
      displayName,
      passwordHash,
      passwordUpdatedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      accountStatus: UserAccountStatus.ACTIVE,
      originNodeCode: enterpriseNode.code,
      lastModifiedByNodeCode: enterpriseNode.code
    },
    select: {
      id: true,
      loginId: true
    }
  });

  await prisma.retailUserRole.deleteMany({
    where: {
      retailUserId: user.id
    }
  });

  await prisma.retailUserRole.create({
    data: {
      retailUserId: user.id,
      roleId: hqRole.id
    }
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

  await prisma.securityLog.create({
    data: {
      retailOrgId: enterpriseNode.retailOrgId,
      kind: SecurityLogKind.AUDIT,
      severity: SecurityLogSeverity.INFO,
      category: "USER",
      action: "BOOTSTRAP_ADMIN",
      actorLabel: "Bootstrap script",
      targetType: "Retail user",
      targetRef: user.loginId,
      sourceNodeCode: enterpriseNode.code,
      message: `Bootstrap admin ${user.loginId} was created or reset with HQ_ADMIN privileges.`,
      detailsJson: serializeJsonField({
        roleCode: hqRole.code
      })
    }
  });

  console.log("Flash ERP bootstrap admin is ready.");
  console.log(`Login ID: ${loginId}`);
  console.log(`Password: ${password}`);
  console.log(`Role: ${hqRole.code}`);
  console.log(`Retail org: ${enterpriseNode.retailOrg.name} (${enterpriseNode.retailOrg.code})`);
  console.log(`Enterprise node: ${enterpriseNode.code}`);
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
