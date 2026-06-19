import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { EnterpriseAuthError } from "@/server/auth/enterprise-session";
import {
  ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
  isEnterpriseDatabaseSchemaNotReadyError,
  isPrismaSchemaDriftError
} from "@/server/readiness/enterprise-database-readiness";

const databaseUnavailableMessage =
  "Flash ERP enterprise database is unavailable right now. Start the configured SQL Server service and try again.";
const databaseSchemaNotReadyMessage =
  "Flash ERP enterprise database schema is not ready for this build. Apply the latest Prisma migrations and restart the enterprise server before retrying.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPrismaDatabaseUnavailableError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "ECONNREFUSED") {
    return true;
  }

  if (!isObject(error)) {
    return false;
  }

  const code = error.code;
  if (code === "ECONNREFUSED") {
    return true;
  }

  const message = error.message;
  return (
    typeof message === "string" &&
    /ECONNREFUSED|can't reach database server|database server at .* was not found/i.test(message)
  );
}

export function createEnterpriseAuthErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof EnterpriseAuthError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json({ message: "Enter a valid request payload." }, { status: 400 });
  }

  if (isEnterpriseDatabaseSchemaNotReadyError(error)) {
    return NextResponse.json(
      {
        message: error.message,
        code: ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
        schemaDrift: true,
        readiness: error.readiness
      },
      { status: 503 }
    );
  }

  if (isPrismaSchemaDriftError(error)) {
    return NextResponse.json(
      {
        message: databaseSchemaNotReadyMessage,
        code: ENTERPRISE_DATABASE_SCHEMA_ERROR_CODE,
        schemaDrift: true,
        detail: error instanceof Error ? error.message : undefined
      },
      { status: 503 }
    );
  }

  if (isPrismaDatabaseUnavailableError(error)) {
    return NextResponse.json({ message: databaseUnavailableMessage }, { status: 503 });
  }

  console.error(error);

  return NextResponse.json({ message: fallbackMessage }, { status: 500 });
}
