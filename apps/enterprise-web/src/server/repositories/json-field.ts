import { Prisma } from "@prisma/client";

export function serializeJsonField(value: unknown): string | null {
  if (
    value === null ||
    value === undefined ||
    value === Prisma.JsonNull ||
    value === Prisma.DbNull ||
    value === Prisma.AnyNull
  ) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

export function serializeRequiredJsonField(value: unknown): string {
  return serializeJsonField(value) ?? "null";
}

export function parseJsonField(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function readJsonObject(value: unknown): Record<string, unknown> {
  const parsed = parseJsonField(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

export function readJsonStringArray(value: unknown): string[] | null {
  const parsed = parseJsonField(value);

  if (!Array.isArray(parsed)) {
    return null;
  }

  const values = parsed
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);

  return values.length > 0 ? values : null;
}
