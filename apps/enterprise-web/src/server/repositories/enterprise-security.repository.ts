import { Prisma } from "@prisma/client";
import {
  deriveRetailUserCapabilities,
  expandGrantedPermissionCodes,
  getSecurityPermissionDefinition as getDomainSecurityPermissionDefinition,
  RecordStatus,
  SecurityLogKind,
  SecurityLogSeverity,
  securityPermissionCatalog,
  type SecurityPermissionDefinition,
  type SecurityPermissionDomain,
  SyncNodeType,
  UserAccountStatus
} from "@flash-erp/domain";
import bcrypt from "bcryptjs";
import { readJsonObject, serializeJsonField } from "./json-field";

import { prisma } from "@/lib/db/prisma";
import { ensurePermissionCatalogSchemaCompatibility } from "@/server/repositories/schema-compatibility.repository";

function formatRelativeTime(value: Date | null) {
  if (!value) {
    return "Not yet";
  }

  const minutes = Math.max(0, Math.floor((Date.now() - value.getTime()) / 60_000));

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function normalizeRequiredText(value: string | null | undefined, fieldLabel: string) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    throw new Error(`Flash ERP needs a ${fieldLabel}.`);
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function normalizeCode(value: string | null | undefined, fieldLabel: string) {
  return normalizeRequiredText(value, fieldLabel)
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function normalizeRecordStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? RecordStatus.ACTIVE;

  if (
    normalized === RecordStatus.ACTIVE ||
    normalized === RecordStatus.INACTIVE ||
    normalized === RecordStatus.ARCHIVED
  ) {
    return normalized;
  }

  throw new Error("Flash ERP only supports ACTIVE, INACTIVE, or ARCHIVED status values here.");
}

function normalizeUserAccountStatus(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? UserAccountStatus.INVITED;

  if (
    normalized === UserAccountStatus.INVITED ||
    normalized === UserAccountStatus.ACTIVE ||
    normalized === UserAccountStatus.SUSPENDED ||
    normalized === UserAccountStatus.DISABLED
  ) {
    return normalized;
  }

  throw new Error(
    "Flash ERP only supports INVITED, ACTIVE, SUSPENDED, or DISABLED user status values here."
  );
}

function normalizeSelectionCodes(values: string[] | null | undefined, fieldLabel: string) {
  const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];

  if (normalized.length === 0) {
    throw new Error(`Flash ERP needs at least one ${fieldLabel}.`);
  }

  return normalized;
}

function toSecurityMutationError(error: unknown, fallbackMessage: string) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return new Error("That user or role identifier already exists in Flash ERP enterprise.");
  }

  return error instanceof Error ? error : new Error(fallbackMessage);
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function changedAuditFields(previousJson: Record<string, unknown>, updatedJson: Record<string, unknown>) {
  return Array.from(new Set([...Object.keys(previousJson), ...Object.keys(updatedJson)])).filter(
    (key) => JSON.stringify(previousJson[key] ?? null) !== JSON.stringify(updatedJson[key] ?? null)
  );
}

function buildUpdateAuditDetails(
  previousJson: Record<string, unknown>,
  updatedJson: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  const changedFields = changedAuditFields(previousJson, updatedJson);

  return toAuditJson({
    ...extra,
    changedFields,
    changedFieldsLabel: changedFields.join(", "),
    previousJson,
    updatedJson
  });
}

type MfaPolicyMode = "DISABLED" | "ADMIN_ONLY" | "ALL_USERS";

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
  mfaMode: MfaPolicyMode;
  mfaGraceMinutes: number;
  stepUpForSensitiveActions: boolean;
  stepUpWindowMinutes: number;
  accountUnlockRequiresAdmin: boolean;
  securityAlertEmail: string;
  criticalAlertEscalationMinutes: number;
  alertOnAccountLockout: boolean;
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
  sessionTimeoutMinutes: 30,
  mfaMode: "DISABLED",
  mfaGraceMinutes: 0,
  stepUpForSensitiveActions: true,
  stepUpWindowMinutes: 10,
  accountUnlockRequiresAdmin: true,
  securityAlertEmail: "",
  criticalAlertEscalationMinutes: 15,
  alertOnAccountLockout: true
};

type MfaSmtpDeliveryConfiguration = {
  enabled: boolean;
  host: string;
  username: string;
  password: string;
  fromAddress: string;
};

function readMfaSmtpDeliveryConfiguration(value: unknown): MfaSmtpDeliveryConfiguration {
  const payload = readJsonObject(value);
  const readText = (key: string) =>
    typeof payload[key] === "string" ? String(payload[key]).trim() : "";

  return {
    enabled: payload.enabled === true,
    host: readText("host"),
    username: readText("username"),
    password: readText("passwordMask"),
    fromAddress: readText("fromAddress")
  };
}

function hasValidMfaEmail(value: string | null | undefined) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value?.trim() ?? "");
}

function requiresAdministratorMfa(permissionCodes: string[]) {
  return expandGrantedPermissionCodes(permissionCodes).some(
    (permissionCode) =>
      permissionCode.startsWith("security.") ||
      permissionCode.startsWith("settings.") ||
      permissionCode.startsWith("sync.")
  );
}

async function assertMfaPolicyDeliveryReadiness(
  tx: Prisma.TransactionClient,
  retailOrgId: string,
  mode: MfaPolicyMode
) {
  if (mode === "DISABLED") {
    return;
  }

  const retailOrg = await tx.retailOrg.findUnique({
    where: { id: retailOrgId },
    select: { smtpSettingsJson: true }
  });
  const smtp = readMfaSmtpDeliveryConfiguration(retailOrg?.smtpSettingsJson);

  if (!smtp.enabled || !smtp.host || !smtp.username || !smtp.password || !smtp.fromAddress) {
    throw new Error(
      "Configure and validate SMTP before enabling MFA. Enterprise MFA requires an enabled SMTP host, sender address, username, and password."
    );
  }

  const activeUsers = await tx.retailUser.findMany({
    where: {
      retailOrgId,
      accountStatus: UserAccountStatus.ACTIVE,
      deletedAt: null
    },
    select: {
      loginId: true,
      email: true,
      userRoles: {
        select: {
          role: {
            select: {
              status: true,
              rolePermissions: {
                select: {
                  permission: {
                    select: { code: true }
                  }
                }
              }
            }
          }
        }
      }
    }
  });
  const mfaUsers = activeUsers.filter((user) => {
    if (mode === "ALL_USERS") {
      return true;
    }

    const permissionCodes = user.userRoles
      .filter((entry) => entry.role.status === RecordStatus.ACTIVE)
      .flatMap((entry) => entry.role.rolePermissions.map((permission) => permission.permission.code));

    return requiresAdministratorMfa(permissionCodes);
  });

  if (mfaUsers.length === 0) {
    throw new Error(
      mode === "ADMIN_ONLY"
        ? "MFA could not be enabled because no active administrator has security, settings, or sync access."
        : "MFA could not be enabled because there are no active users."
    );
  }

  const missingEmailLogins = mfaUsers
    .filter((user) => !hasValidMfaEmail(user.email))
    .map((user) => user.loginId);

  if (missingEmailLogins.length > 0) {
    const sample = missingEmailLogins.slice(0, 5).join(", ");
    const remainder = missingEmailLogins.length - Math.min(missingEmailLogins.length, 5);
    throw new Error(
      `Every user covered by MFA needs a valid email address before MFA can be enabled. Add an email for: ${sample}${remainder > 0 ? ` and ${remainder} more` : ""}.`
    );
  }
}

const explicitSecurityPermissionFallbacks: SecurityPermissionDefinition[] = [
  {
    code: "pos.layaway.create",
    name: "Create layaways",
    description: "Create a layaway and accept its opening deposit subject to company policy.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 442
  },
  {
    code: "pos.layaway.payment.receive",
    name: "Receive layaway payments",
    description: "Receive and attribute installment payments against an active layaway.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 443
  },
  {
    code: "pos.layaway.cancel-refund",
    name: "Cancel and refund layaways",
    description: "Cancel a layaway and process its policy-governed refund and cancellation fee.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 444
  },
  {
    code: "pos.layaway.reservation.release",
    name: "Release layaway reservations",
    description: "Release reserved layaway stock without completing the layaway sale.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 445
  },
  {
    code: "pos.layaway.policy.override",
    name: "Override layaway policy",
    description: "Approve an exception to deposit, reservation, cancellation, or fulfilment policy.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 446
  },
  {
    code: "pos.layaway.fulfil",
    name: "Fulfil layaways",
    description: "Convert a fully eligible layaway into a completed sale and release its reservation.",
    domain: "POS",
    group: "Layaway",
    surface: "store",
    sortOrder: 447
  },
  {
    code: "ecommerce.console.access",
    name: "Access ecommerce staff console",
    description: "Open and operate customer orders, catalog publication, payment options, and storefront setup.",
    domain: "Operations",
    group: "Ecommerce",
    surface: "store",
    sortOrder: 321
  },
  {
    code: "sync.store.operate",
    name: "Operate store sync",
    description: "Open the store desktop sync workspace, run manual sync, and recover local sync queues.",
    domain: "Sync",
    group: "Store operations",
    surface: "store",
    sortOrder: 455
  }
];

const onlineStoreRoleCodes = new Set([
  "ONLINE_STORE_CASHIER",
  "ONLINE_STORE_SUPERVISOR"
]);

function canUseOnlineStoreRole(homeStore: { storeMode: string; status: string } | null) {
  return homeStore?.storeMode === "ONLINE_DIRECT" && homeStore.status === RecordStatus.ACTIVE;
}

function getEnterpriseSecurityPermissionCatalog() {
  const byCode = new Map(
    securityPermissionCatalog.map((permission) => [permission.code, permission] as const)
  );

  for (const permission of explicitSecurityPermissionFallbacks) {
    byCode.set(permission.code, byCode.get(permission.code) ?? permission);
  }

  return [...byCode.values()].sort((left, right) =>
    left.sortOrder === right.sortOrder
      ? left.code.localeCompare(right.code)
      : left.sortOrder - right.sortOrder
  );
}

function getEnterpriseSecurityPermissionDefinition(code: string) {
  return (
    getDomainSecurityPermissionDefinition(code) ??
    explicitSecurityPermissionFallbacks.find((permission) => permission.code === code) ??
    null
  );
}

function groupEnterpriseSecurityPermissions() {
  const source = getEnterpriseSecurityPermissionCatalog();
  const domains = [...new Set(source.map((permission) => permission.domain))] as SecurityPermissionDomain[];
  const grouped = new Map<
    SecurityPermissionDomain,
    Array<{
      group: string;
      permissions: SecurityPermissionDefinition[];
    }>
  >();

  for (const permission of source) {
    const domainGroups = grouped.get(permission.domain) ?? [];
    const existingGroup = domainGroups.find((group) => group.group === permission.group);

    if (existingGroup) {
      existingGroup.permissions.push(permission);
    } else {
      domainGroups.push({
        group: permission.group,
        permissions: [permission]
      });
    }

    grouped.set(permission.domain, domainGroups);
  }

  return domains
    .map((domain) => ({
      domain,
      groups:
        grouped.get(domain)?.map((entry) => ({
          group: entry.group,
          permissions: [...entry.permissions].sort((left, right) =>
            left.sortOrder === right.sortOrder
              ? left.name.localeCompare(right.name)
              : left.sortOrder - right.sortOrder
          )
        })) ?? []
    }))
    .filter((entry) => entry.groups.length > 0);
}

export function readPasswordPolicy(
  value: Prisma.JsonValue | null | undefined
): PasswordPolicySettings {
  const payload = readJsonObject(value) as Record<string, Prisma.JsonValue>;
  const readNumber = (key: keyof PasswordPolicySettings, fallback: number) => {
    const candidate = payload[key];
    return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
  };
  const readBoolean = (key: keyof PasswordPolicySettings, fallback: boolean) => {
    const candidate = payload[key];
    return typeof candidate === "boolean" ? candidate : fallback;
  };
  const readMfaMode = () => {
    const candidate = payload.mfaMode;
    return candidate === "ADMIN_ONLY" || candidate === "ALL_USERS" || candidate === "DISABLED"
      ? candidate
      : defaultPasswordPolicy.mfaMode;
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
    ),
    mfaMode: readMfaMode(),
    mfaGraceMinutes: readNumber("mfaGraceMinutes", defaultPasswordPolicy.mfaGraceMinutes),
    stepUpForSensitiveActions: readBoolean(
      "stepUpForSensitiveActions",
      defaultPasswordPolicy.stepUpForSensitiveActions
    ),
    stepUpWindowMinutes: readNumber(
      "stepUpWindowMinutes",
      defaultPasswordPolicy.stepUpWindowMinutes
    ),
    accountUnlockRequiresAdmin: readBoolean(
      "accountUnlockRequiresAdmin",
      defaultPasswordPolicy.accountUnlockRequiresAdmin
    ),
    securityAlertEmail:
      typeof payload.securityAlertEmail === "string"
        ? payload.securityAlertEmail
        : defaultPasswordPolicy.securityAlertEmail,
    criticalAlertEscalationMinutes: readNumber(
      "criticalAlertEscalationMinutes",
      defaultPasswordPolicy.criticalAlertEscalationMinutes
    ),
    alertOnAccountLockout: readBoolean(
      "alertOnAccountLockout",
      defaultPasswordPolicy.alertOnAccountLockout
    )
  };
}

type EnterpriseContext = {
  id: string;
  code: string;
  name: string;
  retailOrgId: string;
  retailOrg: {
    passwordPolicyJson: Prisma.JsonValue | null;
  };
};

function validatePasswordPolicy(password: string, policy: PasswordPolicySettings) {
  if (password.length < policy.minimumLength) {
    throw new Error(
      `Password must be at least ${policy.minimumLength} character(s) long.`
    );
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    throw new Error("Password must include at least one uppercase letter.");
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    throw new Error("Password must include at least one lowercase letter.");
  }

  if (policy.requireDigit && !/[0-9]/.test(password)) {
    throw new Error("Password must include at least one digit.");
  }

  if (policy.requireSymbol && !/[^\w\s]/.test(password)) {
    throw new Error("Password must include at least one symbol.");
  }
}

async function getEnterpriseContext(): Promise<EnterpriseContext | null> {
  return prisma.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      id: true,
      code: true,
      name: true,
      retailOrgId: true,
      retailOrg: {
        select: {
          passwordPolicyJson: true
        }
      }
    }
  });
}

async function getWritableEnterpriseNode(tx: Prisma.TransactionClient) {
  const enterpriseNode = await tx.syncNode.findFirst({
    where: {
      nodeType: SyncNodeType.ENTERPRISE,
      isPrimary: true,
      status: RecordStatus.ACTIVE
    },
    select: {
      retailOrgId: true,
      code: true
    }
  });

  if (!enterpriseNode) {
    throw new Error("No primary enterprise node is available for security changes.");
  }

  return enterpriseNode;
}

async function ensureEnterprisePermissionCatalog() {
  await ensurePermissionCatalogSchemaCompatibility();
  const catalog = getEnterpriseSecurityPermissionCatalog();
  const existingPermissions = await prisma.permission.findMany({
    where: { code: { in: catalog.map((permission) => permission.code) } },
    select: { code: true, name: true, description: true }
  });
  const existingByCode = new Map(
    existingPermissions.map((permission) => [permission.code, permission] as const)
  );
  const changedPermissions = catalog.filter((permission) => {
    const existing = existingByCode.get(permission.code);
    return !existing || existing.name !== permission.name || existing.description !== permission.description;
  });

  for (let index = 0; index < changedPermissions.length; index += 20) {
    await prisma.$transaction(
      changedPermissions.slice(index, index + 20).map((permission) =>
        prisma.permission.upsert({
          where: { code: permission.code },
          update: {
            name: permission.name,
            description: permission.description
          },
          create: {
            code: permission.code,
            name: permission.name,
            description: permission.description
          }
        })
      )
    );
  }
}

async function writeSecurityLog(
  tx: Prisma.TransactionClient,
  input: {
    retailOrgId: string;
    kind: SecurityLogKind;
    severity?: SecurityLogSeverity;
    category: string;
    action: string;
    actorLabel: string;
    targetType?: string | null;
    targetRef?: string | null;
    sourceNodeCode?: string | null;
    message: string;
    details?: Prisma.InputJsonValue | null;
  }
) {
  await tx.securityLog.create({
    data: {
      retailOrgId: input.retailOrgId,
      kind: input.kind,
      severity: input.severity ?? SecurityLogSeverity.INFO,
      category: input.category,
      action: input.action,
      actorLabel: input.actorLabel,
      targetType: input.targetType ?? null,
      targetRef: input.targetRef ?? null,
      sourceNodeCode: input.sourceNodeCode ?? null,
      message: input.message,
      detailsJson: serializeJsonField(input.details)
    }
  });
}

function summarizeLogDetailValue(value: Prisma.JsonValue) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value);
    return text.length > 48 ? `${text.slice(0, 45)}...` : text;
  }

  return Array.isArray(value) ? `${value.length} item(s)` : "details";
}

function buildLogDetailsSummary(details: Record<string, Prisma.JsonValue> | null) {
  if (!details) {
    return "";
  }

  const priorityKeys = [
    "operation",
    "eventType",
    "eventId",
    "errorCode",
    "errorName",
    "changedFieldsLabel",
    "sourceNodeCode",
    "targetNodeCode",
    "idempotencyKey",
    "targetRef",
    "status"
  ];
  const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined);
  const orderedEntries = [
    ...priorityKeys
      .map((key) => entries.find(([entryKey]) => entryKey === key))
      .filter((entry): entry is [string, Prisma.JsonValue] => Boolean(entry)),
    ...entries.filter(([key]) => !priorityKeys.includes(key))
  ];

  return orderedEntries
    .slice(0, 2)
    .map(([key, value]) => {
      const summary = summarizeLogDetailValue(value);
      return summary ? `${key}: ${summary}` : "";
    })
    .filter(Boolean)
    .join(" / ");
}

function mapSecurityLogRow(
  entry: {
    id: string;
    category: string;
    action: string;
    actorLabel: string;
    targetType: string | null;
    targetRef: string | null;
    sourceNodeCode: string | null;
    message: string;
    detailsJson: Prisma.JsonValue | null;
    severity: SecurityLogSeverity;
    createdAt: Date;
  }
) {
  const parsedDetails = readJsonObject(entry.detailsJson) as Record<string, Prisma.JsonValue>;
  const details = Object.keys(parsedDetails).length > 0 ? parsedDetails : null;
  const detailsLabel = buildLogDetailsSummary(details);

  return {
    securityLogId: entry.id,
    category: entry.category,
    action: entry.action,
    actorLabel: entry.actorLabel,
    sourceNodeCode: entry.sourceNodeCode,
    targetLabel:
      entry.targetType && entry.targetRef ? `${entry.targetType}: ${entry.targetRef}` : null,
    message: entry.message,
    details,
    detailsLabel,
    severity: entry.severity,
    createdAt: entry.createdAt.toISOString(),
    createdAtLabel: formatRelativeTime(entry.createdAt)
  };
}

export type EnterpriseSecurityWorkspaceData = {
  metrics: {
    activeRoles: number;
    activeUsers: number;
    cashierEligibleUsers: number;
    supervisorEligibleUsers: number;
    onlineStoreEligibleUsers: number;
    permissionCatalogCount: number;
    onlineUsers: number;
    auditLogsLast7Days: number;
    securityLogsLast7Days: number;
  };
  passwordPolicy: PasswordPolicySettings;
  availableStores: Array<{
    storeCode: string;
    name: string;
    storeMode: string;
    status: string;
  }>;
  availablePermissions: Array<{
    permissionCode: string;
    name: string;
    description: string | null;
    domain: string;
    group: string;
    surface: string;
    legacy: boolean;
  }>;
  permissionGroups: Array<{
    domain: string;
    groups: Array<{
      group: string;
      permissions: Array<{
        permissionCode: string;
        name: string;
        description: string | null;
        surface: string;
        legacy: boolean;
      }>;
    }>;
  }>;
  availableRoles: Array<{
    roleCode: string;
    name: string;
    status: string;
    permissionCount: number;
  }>;
  permissionRows: Array<{
    permissionCode: string;
    name: string;
    description: string | null;
    domain: string;
    group: string;
    surface: string;
    legacy: boolean;
    assignedRoleCount: number;
  }>;
  roleRows: Array<{
    roleCode: string;
    name: string;
    description: string | null;
    status: string;
    permissionCodes: string[];
    permissionCount: number;
    permissionDomainCount: number;
    assignedUserCount: number;
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  userRows: Array<{
    userId: string;
    loginId: string;
    email: string | null;
    displayName: string;
    accountStatus: string;
    failedLoginAttempts: number;
    lockedUntil: string | null;
    lockedUntilLabel: string | null;
    isLocked: boolean;
    homeStoreCode: string | null;
    homeStoreName: string | null;
    homeStoreMode: string | null;
    onlineStoreEligible: boolean;
    roleCodes: string[];
    roleNames: string[];
    permissionCodes: string[];
    cashierEligible: boolean;
    supervisorEligible: boolean;
    capabilities: {
      canOpenShift: boolean;
      canCloseShift: boolean;
      canProcessSale: boolean;
      canProcessReturn: boolean;
      canProcessExchange: boolean;
      canSearchReceipt: boolean;
      canReprintReceipt: boolean;
      canAttachCustomer: boolean;
      canCollectAccountPayment: boolean;
      canRedeemLoyalty: boolean;
      canApproveNoReceiptReturn: boolean;
      canApproveDiscountOverride: boolean;
      canApprovePriceOverride: boolean;
    };
    updatedAt: string;
    updatedAtLabel: string;
  }>;
  auditLogRows: Array<{
    securityLogId: string;
    category: string;
    action: string;
    actorLabel: string;
    sourceNodeCode: string | null;
    targetLabel: string | null;
    message: string;
    details: Record<string, unknown> | null;
    detailsLabel: string;
    severity: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  securityLogRows: Array<{
    securityLogId: string;
    category: string;
    action: string;
    actorLabel: string;
    sourceNodeCode: string | null;
    targetLabel: string | null;
    message: string;
    details: Record<string, unknown> | null;
    detailsLabel: string;
    severity: string;
    createdAt: string;
    createdAtLabel: string;
  }>;
  onlineUserRows: Array<{
    userId: string;
    loginId: string;
    displayName: string;
    storeName: string;
    terminalName: string;
    shiftNo: string;
    openedAt: string;
    openedAtLabel: string;
    nodeHealth: string;
  }>;
  postureMessages: string[];
  priorities: string[];
  statusMessage: string;
  refreshedAt: string;
};

export function buildUnavailableEnterpriseSecurityWorkspace(
  reason: string
): EnterpriseSecurityWorkspaceData {
  return {
    metrics: {
      activeRoles: 0,
      activeUsers: 0,
      cashierEligibleUsers: 0,
      supervisorEligibleUsers: 0,
      onlineStoreEligibleUsers: 0,
      permissionCatalogCount: 0,
      onlineUsers: 0,
      auditLogsLast7Days: 0,
      securityLogsLast7Days: 0
    },
    passwordPolicy: defaultPasswordPolicy,
    availableStores: [],
    availablePermissions: [],
    permissionGroups: [],
    availableRoles: [],
    permissionRows: [],
    roleRows: [],
    userRows: [],
    auditLogRows: [],
    securityLogRows: [],
    onlineUserRows: [],
    postureMessages: [
      "Enterprise roles, permissions, and retail users will appear here once Flash ERP can read the control-plane database.",
      "Store desktops already expect centrally managed operators, so this workspace should remain the source of truth."
    ],
    priorities: [
      "Start the Flash ERP enterprise database and confirm the primary enterprise node is active.",
      "Seed or create at least one role with POS permissions before onboarding branch cashiers."
    ],
    statusMessage: reason,
    refreshedAt: new Date().toISOString()
  };
}

export async function getEnterpriseSecurityWorkspace(): Promise<EnterpriseSecurityWorkspaceData> {
  const enterpriseNode = await getEnterpriseContext();

  if (!enterpriseNode) {
    return buildUnavailableEnterpriseSecurityWorkspace(
      "No primary enterprise node is available yet, so Flash ERP cannot read security policy."
    );
  }

  await ensureEnterprisePermissionCatalog();

  const recentWindowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const [
    stores,
    permissions,
    roles,
    users,
    openShifts,
    auditLogs,
    securityLogs,
    auditLogsLast7Days,
    securityLogsLast7Days
  ] = await Promise.all([
    prisma.store.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: {
        name: "asc"
      },
      select: {
        code: true,
        name: true,
        storeMode: true,
        status: true
      }
    }),
    prisma.permission.findMany({
      orderBy: {
        code: "asc"
      },
      select: {
        code: true,
        name: true,
        description: true,
        rolePermissions: {
          select: {
            roleId: true
          }
        }
      }
    }),
    prisma.role.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId
      },
      orderBy: [{ name: "asc" }, { code: "asc" }],
      select: {
        code: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        rolePermissions: {
          select: {
            permission: {
              select: {
                code: true
              }
            }
          }
        },
        _count: {
          select: {
            userRoles: true
          }
        }
      }
    }),
    prisma.retailUser.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        deletedAt: null
      },
      orderBy: [{ displayName: "asc" }, { loginId: "asc" }],
      select: {
        id: true,
        loginId: true,
        email: true,
        displayName: true,
        accountStatus: true,
        failedLoginAttempts: true,
        lockedUntil: true,
        updatedAt: true,
        homeStore: {
          select: {
            code: true,
            name: true,
            status: true,
            storeMode: true
          }
        },
        userRoles: {
          select: {
            role: {
              select: {
                code: true,
                name: true,
                status: true,
                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        code: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }),
    prisma.posShift.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        status: "OPEN"
      },
      orderBy: {
        openedAt: "desc"
      },
      select: {
        shiftNo: true,
        openedAt: true,
        cashierUser: {
          select: {
            id: true,
            loginId: true,
            displayName: true
          }
        },
        store: {
          select: {
            name: true
          }
        },
        terminal: {
          select: {
            name: true,
            syncNodes: {
              orderBy: {
                lastHeartbeatAt: "desc"
              },
              take: 1,
              select: {
                lastReportedHealth: true
              }
            }
          }
        }
      }
    }),
    prisma.securityLog.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 60,
      select: {
        id: true,
        severity: true,
        category: true,
        action: true,
        actorLabel: true,
        targetType: true,
        targetRef: true,
        sourceNodeCode: true,
        message: true,
        detailsJson: true,
        createdAt: true
      }
    }),
    prisma.securityLog.findMany({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 60,
      select: {
        id: true,
        severity: true,
        category: true,
        action: true,
        actorLabel: true,
        targetType: true,
        targetRef: true,
        sourceNodeCode: true,
        message: true,
        detailsJson: true,
        createdAt: true
      }
    }),
    prisma.securityLog.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        createdAt: {
          gte: recentWindowStart
        }
      }
    }),
    prisma.securityLog.count({
      where: {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        createdAt: {
          gte: recentWindowStart
        }
      }
    })
  ]);

  const roleRows = roles.map((role) => {
    const permissionCodes = [
      ...new Set(role.rolePermissions.map((entry) => entry.permission.code))
    ].sort();
    const permissionDomains = new Set(
      permissionCodes
        .map((permissionCode) => getEnterpriseSecurityPermissionDefinition(permissionCode)?.domain ?? null)
        .filter((domain): domain is NonNullable<typeof domain> => Boolean(domain))
    );

    return {
      roleCode: role.code,
      name: role.name,
      description: role.description,
      status: role.status,
      permissionCodes,
      permissionCount: permissionCodes.length,
      permissionDomainCount: permissionDomains.size,
      assignedUserCount: role._count.userRoles,
      updatedAt: role.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(role.updatedAt)
    };
  });

  const userRows = users.map((user) => {
    const activeRoleEntries = user.userRoles.filter((entry) => entry.role.status === RecordStatus.ACTIVE);
    const roleCodes = [...new Set(user.userRoles.map((entry) => entry.role.code))].sort();
    const roleNames = [...new Set(user.userRoles.map((entry) => entry.role.name))].sort();
    const onlineStoreEligible =
      user.homeStore?.storeMode === "ONLINE_DIRECT" &&
      user.homeStore.status === RecordStatus.ACTIVE &&
      activeRoleEntries.some((entry) => onlineStoreRoleCodes.has(entry.role.code));
    const permissionCodes = [
      ...new Set(
        activeRoleEntries.flatMap((entry) =>
          entry.role.rolePermissions.map((permission) => permission.permission.code)
        )
      )
    ].sort();
    const capabilities = deriveRetailUserCapabilities(permissionCodes, user.accountStatus);

    return {
      userId: user.id,
      loginId: user.loginId,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus,
      failedLoginAttempts: user.failedLoginAttempts ?? 0,
      lockedUntil: user.lockedUntil?.toISOString() ?? null,
      lockedUntilLabel: user.lockedUntil ? formatRelativeTime(user.lockedUntil) : null,
      isLocked: Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now()),
      homeStoreCode: user.homeStore?.code ?? null,
      homeStoreName: user.homeStore?.name ?? null,
      homeStoreMode: user.homeStore?.storeMode ?? null,
      onlineStoreEligible,
      roleCodes,
      roleNames,
      permissionCodes: capabilities.normalizedPermissionCodes,
      cashierEligible: capabilities.cashierEligible,
      supervisorEligible: capabilities.supervisorEligible,
      capabilities: {
        canOpenShift: capabilities.canOpenShift,
        canCloseShift: capabilities.canCloseShift,
        canProcessSale: capabilities.canProcessSale,
        canProcessReturn: capabilities.canProcessReturn,
        canProcessExchange: capabilities.canProcessExchange,
        canSearchReceipt: capabilities.canSearchReceipt,
        canReprintReceipt: capabilities.canReprintReceipt,
        canAttachCustomer: capabilities.canAttachCustomer,
        canCollectAccountPayment: capabilities.canCollectAccountPayment,
        canRedeemLoyalty: capabilities.canRedeemLoyalty,
        canApproveNoReceiptReturn: capabilities.canApproveNoReceiptReturn,
        canApproveDiscountOverride: capabilities.canApproveDiscountOverride,
        canApprovePriceOverride: capabilities.canApprovePriceOverride
      },
      updatedAt: user.updatedAt.toISOString(),
      updatedAtLabel: formatRelativeTime(user.updatedAt)
    };
  });

  const activeRoles = roleRows.filter((role) => role.status === RecordStatus.ACTIVE);
  const activeUsers = userRows.filter((user) => user.accountStatus === UserAccountStatus.ACTIVE);
  const onlineStoreEligibleUsers = activeUsers.filter((user) => user.onlineStoreEligible).length;
  const activeOnlineDirectStores = stores.filter(
    (store) => store.status === RecordStatus.ACTIVE && store.storeMode === "ONLINE_DIRECT"
  );
  const auditLogRows = auditLogs.map(mapSecurityLogRow);
  const securityLogRows = securityLogs.map(mapSecurityLogRow);
  const onlineUserRows = openShifts.map((shift) => ({
    userId: shift.cashierUser.id,
    loginId: shift.cashierUser.loginId,
    displayName: shift.cashierUser.displayName,
    storeName: shift.store.name,
    terminalName: shift.terminal.name,
    shiftNo: shift.shiftNo,
    openedAt: shift.openedAt.toISOString(),
    openedAtLabel: formatRelativeTime(shift.openedAt),
    nodeHealth: shift.terminal.syncNodes[0]?.lastReportedHealth ?? "unknown"
  }));
  const passwordPolicy = readPasswordPolicy(enterpriseNode.retailOrg.passwordPolicyJson);

  const priorities: string[] = [];

  if (activeRoles.length === 0) {
    priorities.push(
      "Create at least one active role with POS permissions before onboarding branch operators."
    );
  }

  if (
    !activeRoles.some((role) =>
      deriveRetailUserCapabilities(role.permissionCodes, UserAccountStatus.ACTIVE).cashierEligible
    )
  ) {
    priorities.push(
      "Create or update a role with `pos.shift.open` and `pos.sale.process` so branch cashiers can open validated local shifts."
    );
  }

  if (
    !activeRoles.some((role) =>
      deriveRetailUserCapabilities(role.permissionCodes, UserAccountStatus.ACTIVE)
        .supervisorEligible
    )
  ) {
    priorities.push(
      "Create or update a role with receipt-less return or other override privileges so supervisors can approve exceptional corrections."
    );
  }

  if (activeUsers.length === 0) {
    priorities.push(
      "Create at least one active retail user and assign it a role before store desktops are expected to validate cashiers."
    );
  }

  if (activeOnlineDirectStores.length > 0 && onlineStoreEligibleUsers === 0) {
    priorities.push(
      "Create active online store cashier or supervisor users with an ONLINE_DIRECT home store before browser POS sign-in is expected to work."
    );
  }

  if (priorities.length === 0) {
    priorities.push(
      "Enterprise security posture looks healthy. The next strong slice is true sign-in/authentication and audit-hardening on top of these centrally managed operators."
    );
  }

  if (auditLogRows.length === 0) {
    priorities.push(
      "Security audit logging is ready but still sparse. The next admin changes will start filling the audit trail."
    );
  }

  return {
    metrics: {
      activeRoles: activeRoles.length,
      activeUsers: activeUsers.length,
      cashierEligibleUsers: activeUsers.filter((user) => user.cashierEligible).length,
      supervisorEligibleUsers: activeUsers.filter((user) => user.supervisorEligible).length,
      onlineStoreEligibleUsers,
      permissionCatalogCount: permissions.length,
      onlineUsers: onlineUserRows.length,
      auditLogsLast7Days,
      securityLogsLast7Days
    },
    passwordPolicy,
    availableStores: stores.map((store) => ({
      storeCode: store.code,
      name: store.name,
      storeMode: store.storeMode,
      status: store.status
    })),
    availablePermissions: permissions.map((permission) => {
      const definition = getEnterpriseSecurityPermissionDefinition(permission.code);

      return {
        permissionCode: permission.code,
        name: permission.name,
        description: permission.description,
        domain: definition?.domain ?? "Security",
        group: definition?.group ?? "Other",
        surface: definition?.surface ?? "enterprise",
        legacy: definition?.legacy ?? false
      };
    }),
    permissionGroups: groupEnterpriseSecurityPermissions().map((domainEntry) => ({
      domain: domainEntry.domain,
      groups: domainEntry.groups.map((groupEntry) => ({
        group: groupEntry.group,
        permissions: groupEntry.permissions.map((permission) => ({
          permissionCode: permission.code,
          name: permission.name,
          description: permission.description,
          surface: permission.surface,
          legacy: permission.legacy ?? false
        }))
      }))
    })),
    availableRoles: roleRows.map((role) => ({
      roleCode: role.roleCode,
      name: role.name,
      status: role.status,
      permissionCount: role.permissionCount
    })),
    permissionRows: permissions.map((permission) => {
      const definition = getEnterpriseSecurityPermissionDefinition(permission.code);

      return {
        permissionCode: permission.code,
        name: permission.name,
        description: permission.description,
        domain: definition?.domain ?? "Security",
        group: definition?.group ?? "Other",
        surface: definition?.surface ?? "enterprise",
        legacy: definition?.legacy ?? false,
        assignedRoleCount: new Set(permission.rolePermissions.map((entry) => entry.roleId)).size
      };
    }),
    roleRows,
    userRows,
    auditLogRows,
    securityLogRows,
    onlineUserRows,
    postureMessages: [
      `${activeRoles.length} active role(s) are currently defined in enterprise security policy.`,
      `${activeUsers.length} active user(s) are centrally managed, with ${activeUsers.filter((user) => user.cashierEligible).length} cashier-eligible and ${activeUsers.filter((user) => user.supervisorEligible).length} supervisor-eligible operator(s).`,
      `${permissions.length} permission code(s) are available for granular role composition across master, settings, security, inventory, POS, sync, and operations.`,
      `${onlineUserRows.length} branch operator(s) currently appear online through open shift posture.`,
      `Password policy currently requires ${passwordPolicy.minimumLength}+ characters with lockout after ${passwordPolicy.maxFailedAttempts} failed attempt(s), ${passwordPolicy.mfaMode} MFA mode, and ${passwordPolicy.stepUpForSensitiveActions ? "step-up checks" : "no step-up checks"} for sensitive actions.`
    ],
    priorities,
    statusMessage: `Flash ERP enterprise is showing centrally managed roles, permissions, and retail users from ${enterpriseNode.name}. Use this workspace to control who stores can validate locally on their next pull.`,
    refreshedAt: new Date().toISOString()
  };
}

export type CreateEnterpriseRoleRequest = {
  roleCode: string;
  name: string;
  description?: string | null;
  status?: string;
  permissionCodes: string[];
};

export type EnterpriseRoleMutationResponse = {
  roleCode: string;
  message: string;
  serverProcessedAt: string;
};

export async function createEnterpriseRole(
  input: CreateEnterpriseRoleRequest
): Promise<EnterpriseRoleMutationResponse> {
  const roleCode = normalizeCode(input.roleCode, "role code");
  const name = normalizeRequiredText(input.name, "role name");
  const description = normalizeOptionalText(input.description);
  const status = normalizeRecordStatus(input.status);
  const permissionCodes = normalizeSelectionCodes(input.permissionCodes, "permission");

  try {
    await ensureEnterprisePermissionCatalog();

    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const permissions = await tx.permission.findMany({
        where: {
          code: {
            in: permissionCodes
          }
        },
        select: {
          id: true,
          code: true
        }
      });

      if (permissions.length !== permissionCodes.length) {
        const resolvedCodes = new Set(permissions.map((permission) => permission.code));
        const missingCodes = permissionCodes.filter((code) => !resolvedCodes.has(code));
        throw new Error(
          `Flash ERP could not find permission code(s): ${missingCodes.join(", ")}.`
        );
      }

      const role = await tx.role.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          code: roleCode,
          name,
          description,
          status
        },
        select: {
          id: true
        }
      });

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id
        })),
        });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "ROLE",
        action: "CREATE",
        actorLabel: "Enterprise setup",
        targetType: "Role",
        targetRef: roleCode,
        sourceNodeCode: enterpriseNode.code,
        message: `Created role ${roleCode} with ${permissionCodes.length} privilege(s).`,
        details: {
          permissionCodes
        }
      });

      return {
        roleCode,
        message: `Flash ERP created role ${roleCode}. Stores will receive the updated permission posture on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not create that role.");
  }
}

export async function updateEnterpriseRole(
  roleCode: string,
  input: CreateEnterpriseRoleRequest
): Promise<EnterpriseRoleMutationResponse> {
  const normalizedRoleCode = normalizeCode(roleCode, "role code");
  const name = normalizeRequiredText(input.name, "role name");
  const description = normalizeOptionalText(input.description);
  const status = normalizeRecordStatus(input.status);
  const permissionCodes = normalizeSelectionCodes(input.permissionCodes, "permission");

  try {
    await ensureEnterprisePermissionCatalog();

    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const [role, permissions] = await Promise.all([
        tx.role.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: normalizedRoleCode
          },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            rolePermissions: {
              select: {
                permission: {
                  select: {
                    code: true
                  }
                }
              }
            }
          }
        }),
        tx.permission.findMany({
          where: {
            code: {
              in: permissionCodes
            }
          },
          select: {
            id: true,
            code: true
          }
        })
      ]);

      if (!role) {
        throw new Error(`Flash ERP could not find role "${normalizedRoleCode}".`);
      }

      if (permissions.length !== permissionCodes.length) {
        const resolvedCodes = new Set(permissions.map((permission) => permission.code));
        const missingCodes = permissionCodes.filter((code) => !resolvedCodes.has(code));
        throw new Error(
          `Flash ERP could not find permission code(s): ${missingCodes.join(", ")}.`
        );
      }

      const previousJson = {
        roleCode: role.code,
        name: role.name,
        description: role.description,
        status: role.status,
        permissionCodes: role.rolePermissions
          .map((rolePermission) => rolePermission.permission.code)
          .sort()
      };
      const updatedJson = {
        roleCode: normalizedRoleCode,
        name,
        description,
        status,
        permissionCodes: [...permissionCodes].sort()
      };

      await tx.role.update({
        where: {
          id: role.id
        },
        data: {
          name,
          description,
          status
        }
      });

      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id
        }
      });

      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId: role.id,
          permissionId: permission.id
        })),
        });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "ROLE",
        action: "UPDATE",
        actorLabel: "Enterprise setup",
        targetType: "Role",
        targetRef: normalizedRoleCode,
        sourceNodeCode: enterpriseNode.code,
        message: `Updated role ${normalizedRoleCode} and reassigned ${permissionCodes.length} privilege(s).`,
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          permissionCodes,
          status
        })
      });

      return {
        roleCode: normalizedRoleCode,
        message: `Flash ERP updated role ${normalizedRoleCode}. Stores will consume the security delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not update that role.");
  }
}

export type CreateEnterpriseRetailUserRequest = {
  loginId: string;
  email?: string | null;
  displayName: string;
  accountStatus?: string;
  homeStoreCode?: string | null;
  roleCodes: string[];
  password?: string | null;
};

export type EnterpriseRetailUserMutationResponse = {
  userId: string;
  loginId: string;
  message: string;
  serverProcessedAt: string;
};

export async function createEnterpriseRetailUser(
  input: CreateEnterpriseRetailUserRequest
): Promise<EnterpriseRetailUserMutationResponse> {
  const loginId = normalizeRequiredText(input.loginId, "login ID");
  const email = normalizeOptionalText(input.email);
  const displayName = normalizeRequiredText(input.displayName, "display name");
  const accountStatus = normalizeUserAccountStatus(input.accountStatus);
  const homeStoreCode = normalizeOptionalText(input.homeStoreCode);
  const roleCodes = normalizeSelectionCodes(input.roleCodes, "role");
  const password = normalizeOptionalText(input.password);
  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new Error("No primary enterprise node is available for user creation.");
  }

  if (!password) {
    throw new Error("Provide a temporary password for this user.");
  }

  const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
  validatePasswordPolicy(password, passwordPolicy);
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const [homeStore, roles] = await Promise.all([
        homeStoreCode
          ? tx.store.findFirst({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: homeStoreCode
              },
              select: {
                id: true,
                code: true,
                status: true,
                storeMode: true
              }
            })
          : Promise.resolve(null),
        tx.role.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: {
              in: roleCodes
            }
          },
          select: {
            id: true,
            code: true
          }
        })
      ]);

      if (homeStoreCode && !homeStore) {
        throw new Error(`Flash ERP could not find store "${homeStoreCode}" for this user.`);
      }

      if (roles.length !== roleCodes.length) {
        const resolvedCodes = new Set(roles.map((role) => role.code));
        const missingCodes = roleCodes.filter((code) => !resolvedCodes.has(code));
        throw new Error(`Flash ERP could not find role code(s): ${missingCodes.join(", ")}.`);
      }

      const hasOnlineStoreRole = roles.some((role) => onlineStoreRoleCodes.has(role.code));

      if (hasOnlineStoreRole && !canUseOnlineStoreRole(homeStore)) {
        throw new Error(
          "Assign online store roles only to users whose home store is an active ONLINE_DIRECT store."
        );
      }

      const user = await tx.retailUser.create({
        data: {
          retailOrgId: enterpriseNode.retailOrgId,
          homeStoreId: homeStore?.id ?? null,
          loginId,
          email,
          displayName,
          passwordHash,
          passwordUpdatedAt: new Date(),
          failedLoginAttempts: 0,
          lockedUntil: null,
          accountStatus,
          originNodeCode: enterpriseNode.code,
          lastModifiedByNodeCode: enterpriseNode.code
        },
        select: {
          id: true,
          loginId: true
        }
      });

      await tx.retailUserRole.createMany({
        data: roles.map((role) => ({
          retailUserId: user.id,
          roleId: role.id
        })),
        });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "USER",
        action: "CREATE",
        actorLabel: "Enterprise setup",
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseNode.code,
        message: `Created retail user ${user.loginId} with ${roleCodes.length} role assignment(s).`,
        details: {
          accountStatus,
          roleCodes,
          homeStoreCode
        }
      });

      if (accountStatus === UserAccountStatus.SUSPENDED || accountStatus === UserAccountStatus.DISABLED) {
        await writeSecurityLog(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          kind: SecurityLogKind.SECURITY,
          severity: SecurityLogSeverity.WARNING,
          category: "USER",
          action: "RESTRICTED",
          actorLabel: "Enterprise setup",
          targetType: "Retail user",
          targetRef: user.loginId,
          sourceNodeCode: enterpriseNode.code,
          message: `Retail user ${user.loginId} was created in ${accountStatus} state.`,
          details: {
            accountStatus
          }
        });
      }

      return {
        userId: user.id,
        loginId: user.loginId,
        message:
          hasOnlineStoreRole && homeStore?.storeMode === "ONLINE_DIRECT"
            ? `Flash ERP created online store user ${user.loginId}. This operator can sign into ${homeStore.code} through the online store.`
            : `Flash ERP created retail user ${user.loginId}. Store desktops will receive the operator on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not create that retail user.");
  }
}

export async function updateEnterpriseRetailUser(
  userId: string,
  input: CreateEnterpriseRetailUserRequest
): Promise<EnterpriseRetailUserMutationResponse> {
  const normalizedUserId = normalizeRequiredText(userId, "user");
  const loginId = normalizeRequiredText(input.loginId, "login ID");
  const email = normalizeOptionalText(input.email);
  const displayName = normalizeRequiredText(input.displayName, "display name");
  const accountStatus = normalizeUserAccountStatus(input.accountStatus);
  const homeStoreCode = normalizeOptionalText(input.homeStoreCode);
  const roleCodes = normalizeSelectionCodes(input.roleCodes, "role");
  const password = normalizeOptionalText(input.password);
  const enterpriseContext = await getEnterpriseContext();

  if (!enterpriseContext) {
    throw new Error("No primary enterprise node is available for user updates.");
  }

  if (password) {
    const passwordPolicy = readPasswordPolicy(enterpriseContext.retailOrg.passwordPolicyJson);
    validatePasswordPolicy(password, passwordPolicy);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const passwordHash = password ? await bcrypt.hash(password, 12) : null;
      const passwordUpdate = password
        ? {
            passwordHash,
            passwordUpdatedAt: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null
          }
        : {};
      const [user, homeStore, roles] = await Promise.all([
        tx.retailUser.findFirst({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            id: normalizedUserId,
            deletedAt: null
          },
          select: {
            id: true,
            loginId: true,
            email: true,
            displayName: true,
            accountStatus: true,
            homeStore: {
              select: {
                code: true
              }
            },
            userRoles: {
              select: {
                role: {
                  select: {
                    code: true
                  }
                }
              }
            }
          }
        }),
        homeStoreCode
          ? tx.store.findFirst({
              where: {
                retailOrgId: enterpriseNode.retailOrgId,
                code: homeStoreCode
              },
              select: {
                id: true,
                code: true,
                status: true,
                storeMode: true
              }
            })
          : Promise.resolve(null),
        tx.role.findMany({
          where: {
            retailOrgId: enterpriseNode.retailOrgId,
            code: {
              in: roleCodes
            }
          },
          select: {
            id: true,
            code: true
          }
        })
      ]);

      if (!user) {
        throw new Error("Flash ERP could not find that retail user.");
      }

      if (homeStoreCode && !homeStore) {
        throw new Error(`Flash ERP could not find store "${homeStoreCode}" for this user.`);
      }

      if (roles.length !== roleCodes.length) {
        const resolvedCodes = new Set(roles.map((role) => role.code));
        const missingCodes = roleCodes.filter((code) => !resolvedCodes.has(code));
        throw new Error(`Flash ERP could not find role code(s): ${missingCodes.join(", ")}.`);
      }

      const hasOnlineStoreRole = roles.some((role) => onlineStoreRoleCodes.has(role.code));

      if (hasOnlineStoreRole && !canUseOnlineStoreRole(homeStore)) {
        throw new Error(
          "Assign online store roles only to users whose home store is an active ONLINE_DIRECT store."
        );
      }

      const previousJson = {
        loginId: user.loginId,
        email: user.email,
        displayName: user.displayName,
        accountStatus: user.accountStatus,
        homeStoreCode: user.homeStore?.code ?? null,
        roleCodes: user.userRoles.map((userRole) => userRole.role.code).sort(),
        passwordChanged: false
      };
      const updatedJson = {
        loginId,
        email,
        displayName,
        accountStatus,
        homeStoreCode,
        roleCodes: [...roleCodes].sort(),
        passwordChanged: Boolean(password)
      };

      const updatedUser = await tx.retailUser.update({
        where: {
          id: user.id
        },
        data: {
          homeStoreId: homeStore?.id ?? null,
          loginId,
          email,
          displayName,
          ...passwordUpdate,
          accountStatus,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        },
        select: {
          id: true,
          loginId: true
        }
      });

      await tx.retailUserRole.deleteMany({
        where: {
          retailUserId: user.id
        }
      });

      await tx.retailUserRole.createMany({
        data: roles.map((role) => ({
          retailUserId: user.id,
          roleId: role.id
        })),
        });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "USER",
        action: "UPDATE",
        actorLabel: "Enterprise setup",
        targetType: "Retail user",
        targetRef: updatedUser.loginId,
        sourceNodeCode: enterpriseNode.code,
        message: `Updated retail user ${updatedUser.loginId} and reassigned ${roleCodes.length} role(s).`,
        details: buildUpdateAuditDetails(previousJson, updatedJson, {
          accountStatus,
          roleCodes,
          homeStoreCode,
          passwordChanged: Boolean(password)
        })
      });

      if (accountStatus === UserAccountStatus.SUSPENDED || accountStatus === UserAccountStatus.DISABLED) {
        await writeSecurityLog(tx, {
          retailOrgId: enterpriseNode.retailOrgId,
          kind: SecurityLogKind.SECURITY,
          severity: SecurityLogSeverity.WARNING,
          category: "USER",
          action: "RESTRICTED",
          actorLabel: "Enterprise setup",
          targetType: "Retail user",
          targetRef: updatedUser.loginId,
          sourceNodeCode: enterpriseNode.code,
          message: `Retail user ${updatedUser.loginId} is now ${accountStatus}.`,
          details: {
            accountStatus
          }
        });
      }

      return {
        userId: updatedUser.id,
        loginId: updatedUser.loginId,
        message:
          hasOnlineStoreRole && homeStore?.storeMode === "ONLINE_DIRECT"
            ? `Flash ERP updated online store user ${updatedUser.loginId}. This operator can sign into ${homeStore.code} through the online store.`
            : `Flash ERP updated retail user ${updatedUser.loginId}. Store desktops will consume the operator delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not update that retail user.");
  }
}

export async function unlockEnterpriseRetailUser(
  userId: string
): Promise<EnterpriseRetailUserMutationResponse> {
  const normalizedUserId = normalizeRequiredText(userId, "user");

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      const user = await tx.retailUser.findFirst({
        where: {
          retailOrgId: enterpriseNode.retailOrgId,
          id: normalizedUserId,
          deletedAt: null
        },
        select: {
          id: true,
          loginId: true,
          failedLoginAttempts: true,
          lockedUntil: true
        }
      });

      if (!user) {
        throw new Error("Flash ERP could not find that retail user.");
      }

      await tx.retailUser.update({
        where: {
          id: user.id
        },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastModifiedByNodeCode: enterpriseNode.code,
          recordVersion: {
            increment: 1
          }
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "USER",
        action: "UNLOCK",
        actorLabel: "Enterprise security",
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseNode.code,
        message: `Unlocked retail user ${user.loginId}.`,
        details: {
          failedLoginAttemptsBeforeUnlock: user.failedLoginAttempts ?? 0,
          lockedUntilBeforeUnlock: user.lockedUntil?.toISOString() ?? null
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.INFO,
        category: "USER",
        action: "ACCOUNT_UNLOCKED",
        actorLabel: "Enterprise security",
        targetType: "Retail user",
        targetRef: user.loginId,
        sourceNodeCode: enterpriseNode.code,
        message: `Retail user ${user.loginId} can sign in again after administrator unlock.`,
        details: {
          previousFailedLoginAttempts: user.failedLoginAttempts ?? 0,
          previousLockedUntil: user.lockedUntil?.toISOString() ?? null
        }
      });

      return {
        userId: user.id,
        loginId: user.loginId,
        message: `Flash ERP unlocked ${user.loginId}. Store desktops will consume the operator security delta on their next pull.`,
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not unlock that retail user.");
  }
}

export type UpdateEnterprisePasswordPolicyRequest = PasswordPolicySettings;

export type PasswordPolicyMutationResponse = {
  message: string;
  serverProcessedAt: string;
};

function normalizeMfaPolicyMode(value: string | null | undefined): MfaPolicyMode {
  const normalized = value?.trim().toUpperCase() ?? defaultPasswordPolicy.mfaMode;

  if (normalized === "DISABLED" || normalized === "ADMIN_ONLY" || normalized === "ALL_USERS") {
    return normalized;
  }

  throw new Error("Flash ERP only supports DISABLED, ADMIN_ONLY, or ALL_USERS MFA policy modes.");
}

function normalizeOptionalEmailText(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";

  if (!normalized) {
    return "";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Enter a valid security alert email address.");
  }

  return normalized.toLowerCase();
}

export async function updateEnterprisePasswordPolicy(
  input: UpdateEnterprisePasswordPolicyRequest
): Promise<PasswordPolicyMutationResponse> {
  const nextPolicy: PasswordPolicySettings = {
    minimumLength: Math.max(6, Math.trunc(Number(input.minimumLength ?? defaultPasswordPolicy.minimumLength))),
    requireUppercase: Boolean(input.requireUppercase),
    requireLowercase: Boolean(input.requireLowercase),
    requireDigit: Boolean(input.requireDigit),
    requireSymbol: Boolean(input.requireSymbol),
    expiryDays: Math.max(0, Math.trunc(Number(input.expiryDays ?? defaultPasswordPolicy.expiryDays))),
    historyCount: Math.max(0, Math.trunc(Number(input.historyCount ?? defaultPasswordPolicy.historyCount))),
    maxFailedAttempts: Math.max(
      1,
      Math.trunc(Number(input.maxFailedAttempts ?? defaultPasswordPolicy.maxFailedAttempts))
    ),
    lockoutMinutes: Math.max(0, Math.trunc(Number(input.lockoutMinutes ?? defaultPasswordPolicy.lockoutMinutes))),
    sessionTimeoutMinutes: Math.max(
      5,
      Math.trunc(Number(input.sessionTimeoutMinutes ?? defaultPasswordPolicy.sessionTimeoutMinutes))
    ),
    mfaMode: normalizeMfaPolicyMode(input.mfaMode),
    mfaGraceMinutes: Math.max(
      0,
      Math.trunc(Number(input.mfaGraceMinutes ?? defaultPasswordPolicy.mfaGraceMinutes))
    ),
    stepUpForSensitiveActions: Boolean(input.stepUpForSensitiveActions),
    stepUpWindowMinutes: Math.max(
      1,
      Math.trunc(Number(input.stepUpWindowMinutes ?? defaultPasswordPolicy.stepUpWindowMinutes))
    ),
    accountUnlockRequiresAdmin: Boolean(input.accountUnlockRequiresAdmin),
    securityAlertEmail: normalizeOptionalEmailText(input.securityAlertEmail),
    criticalAlertEscalationMinutes: Math.max(
      1,
      Math.trunc(
        Number(
          input.criticalAlertEscalationMinutes ??
            defaultPasswordPolicy.criticalAlertEscalationMinutes
        )
      )
    ),
    alertOnAccountLockout: Boolean(input.alertOnAccountLockout)
  };

  try {
    return await prisma.$transaction(async (tx) => {
      const enterpriseNode = await getWritableEnterpriseNode(tx);
      await assertMfaPolicyDeliveryReadiness(
        tx,
        enterpriseNode.retailOrgId,
        nextPolicy.mfaMode
      );
      const currentOrg = await tx.retailOrg.findUnique({
        where: {
          id: enterpriseNode.retailOrgId
        },
        select: {
          passwordPolicyJson: true
        }
      });
      const previousPolicy = readPasswordPolicy(currentOrg?.passwordPolicyJson);

      await tx.retailOrg.update({
        where: {
          id: enterpriseNode.retailOrgId
        },
        data: {
          passwordPolicyJson: serializeJsonField(nextPolicy)
        }
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.AUDIT,
        category: "PASSWORD_POLICY",
        action: "UPDATE",
        actorLabel: "Enterprise security",
        targetType: "Password policy",
        targetRef: "default",
        sourceNodeCode: enterpriseNode.code,
        message: `Updated password policy to minimum ${nextPolicy.minimumLength} characters, ${nextPolicy.maxFailedAttempts} failed-attempt lockout, and ${nextPolicy.mfaMode} MFA mode.`,
        details: buildUpdateAuditDetails(previousPolicy, nextPolicy, {
          minimumLength: nextPolicy.minimumLength,
          maxFailedAttempts: nextPolicy.maxFailedAttempts,
          mfaMode: nextPolicy.mfaMode,
          stepUpForSensitiveActions: nextPolicy.stepUpForSensitiveActions,
          accountUnlockRequiresAdmin: nextPolicy.accountUnlockRequiresAdmin,
          securityAlertEmail: nextPolicy.securityAlertEmail,
          criticalAlertEscalationMinutes: nextPolicy.criticalAlertEscalationMinutes,
          alertOnAccountLockout: nextPolicy.alertOnAccountLockout
        })
      });

      await writeSecurityLog(tx, {
        retailOrgId: enterpriseNode.retailOrgId,
        kind: SecurityLogKind.SECURITY,
        severity: SecurityLogSeverity.INFO,
        category: "PASSWORD_POLICY",
        action: "POLICY_CHANGED",
        actorLabel: "Enterprise security",
        targetType: "Password policy",
        targetRef: "default",
        sourceNodeCode: enterpriseNode.code,
        message: "Password policy was changed for enterprise-controlled users.",
        details: nextPolicy
      });

      return {
        message:
          "Flash ERP saved the password policy. New security posture will be visible immediately in enterprise.",
        serverProcessedAt: new Date().toISOString()
      };
    });
  } catch (error) {
    throw toSecurityMutationError(error, "Flash ERP could not update the password policy.");
  }
}
