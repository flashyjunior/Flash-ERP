import path from "node:path";

import dotenv from "dotenv";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function resolveDatasourceUrl() {
  if (!process.env.DATABASE_URL) {
    dotenv.config({
      path: path.resolve(process.cwd(), "..", "..", ".env")
    });
  }

  const datasourceUrl = process.env.DATABASE_URL;

  if (!datasourceUrl) {
    throw new Error("DATABASE_URL must be set before starting Flash ERP enterprise.");
  }

  return normalizeMssqlConnectionString(datasourceUrl);
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

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaMssql(resolveDatasourceUrl()),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
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
