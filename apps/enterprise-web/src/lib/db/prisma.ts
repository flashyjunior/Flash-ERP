import path from "node:path";

import dotenv from "dotenv";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { Prisma, PrismaClient } from "@prisma/client";

import {
  recordEnterpriseDatabaseError,
  recordEnterpriseDatabaseQuery
} from "@/server/performance/enterprise-runtime-capacity";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function readDatasourceUrl() {
  if (!process.env.DATABASE_URL) {
    const environmentFiles = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "..", "..", ".env")
    ];

    for (const environmentFile of environmentFiles) {
      dotenv.config({ path: environmentFile });
      if (process.env.DATABASE_URL) break;
    }
  }

  const datasourceUrl = process.env.DATABASE_URL;

  if (!datasourceUrl) {
    throw new Error("DATABASE_URL must be set before starting Flash ERP enterprise.");
  }

  return datasourceUrl;
}

export function isEnterpriseSqlServerDatabase() {
  if (!/^sqlserver:\/\//i.test(readDatasourceUrl().trim())) {
    throw new Error(
      "Flash ERP Enterprise requires a SQL Server DATABASE_URL; refusing to execute schema compatibility SQL for another provider."
    );
  }

  return true;
}

function resolveDatasourceUrl() {
  return withEnterpriseDatabaseRuntimeOptions(normalizeMssqlConnectionString(readDatasourceUrl()));
}

function splitMssqlConnectionString(value: string) {
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;

  for (const character of value) {
    if (character === "{") {
      braceDepth += 1;
    } else if (character === "}" && braceDepth > 0) {
      braceDepth -= 1;
    }

    if (character === ";" && braceDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  parts.push(current);
  return parts;
}

function braceMssqlValue(value: string) {
  return /[;\s]/.test(value) ? `{${value}}` : value;
}

function decodeMssqlValue(value: string) {
  const trimmed = value.trim();
  const isBraced =
    trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length >= 2;
  const rawValue = isBraced ? trimmed.slice(1, -1) : value;

  if (!/%[0-9a-f]{2}/i.test(rawValue)) {
    return value;
  }

  try {
    const decodedValue = decodeURIComponent(rawValue);
    return isBraced ? `{${decodedValue}}` : braceMssqlValue(decodedValue);
  } catch {
    return value;
  }
}

function normalizeMssqlConnectionString(datasourceUrl: string) {
  if (!/^sqlserver:\/\//i.test(datasourceUrl)) {
    return datasourceUrl;
  }

  return splitMssqlConnectionString(datasourceUrl)
    .map((part, index) => {
      if (index === 0 || !part.includes("=")) {
        return part;
      }

      const [key, ...valueParts] = part.split("=");
      return `${key}=${decodeMssqlValue(valueParts.join("="))}`;
    })
    .join(";");
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function withEnterpriseDatabaseRuntimeOptions(datasourceUrl: string) {
  if (!/^sqlserver:\/\//i.test(datasourceUrl)) return datasourceUrl;

  const existingKeys = new Set(
    splitMssqlConnectionString(datasourceUrl)
      .slice(1)
      .map((part) => part.split("=", 1)[0]?.trim().toLowerCase())
      .filter(Boolean)
  );
  const options = [
    ["connectionLimit", String(positiveInteger(process.env.FLASH_ERP_DB_POOL_MAX, 20))],
    ["poolTimeout", String(positiveInteger(process.env.FLASH_ERP_DB_POOL_ACQUIRE_TIMEOUT_SECONDS, 15))],
    ["connectionTimeout", String(positiveInteger(process.env.FLASH_ERP_DB_CONNECTION_TIMEOUT_MS, 15_000))],
    ["socketTimeout", String(positiveInteger(process.env.FLASH_ERP_DB_REQUEST_TIMEOUT_MS, 30_000))],
    ["applicationName", process.env.FLASH_ERP_DB_APPLICATION_NAME?.trim() || "Flash ERP Enterprise"]
  ] as const;
  let configured = datasourceUrl.replace(/;+$/, "");

  for (const [key, value] of options) {
    if (!existingKeys.has(key.toLowerCase())) {
      configured += `;${key}=${braceMssqlValue(value)}`;
    }
  }

  return configured;
}

function createPrismaClient() {
  const log: Prisma.LogDefinition[] = [
    { emit: "event", level: "query" },
    { emit: "stdout", level: "error" },
    ...(process.env.NODE_ENV === "development"
      ? ([{ emit: "stdout", level: "warn" }] satisfies Prisma.LogDefinition[])
      : [])
  ];
  const client = new PrismaClient({
    adapter: new PrismaMssql(resolveDatasourceUrl(), {
      onPoolError(error) {
        recordEnterpriseDatabaseError("POOL");
        console.error("Flash ERP enterprise database pool error.", error);
      },
      onConnectionError(error) {
        recordEnterpriseDatabaseError("CONNECTION");
        console.error("Flash ERP enterprise database connection error.", error);
      }
    }),
    log,
    transactionOptions: {
      maxWait: 60_000,
      timeout: 60_000
    }
  });

  client.$on("query", (event: Prisma.QueryEvent) => {
    recordEnterpriseDatabaseQuery(event.duration, event.target);
  });

  return client;
}

function getPrismaClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  }
});
