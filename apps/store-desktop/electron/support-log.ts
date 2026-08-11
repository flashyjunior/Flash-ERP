import { app } from "electron";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

let supportLoggingInstalled = false;
const maxSupportLogBytes = 5 * 1024 * 1024;

export function getDesktopSupportLogPath() {
  const logDirectory = path.join(app.getPath("userData"), "logs");
  mkdirSync(logDirectory, { recursive: true });
  return path.join(logDirectory, "main.log");
}

function serializeSupportLogValue(value: unknown) {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (nestedValue instanceof Error) {
          return {
            name: nestedValue.name,
            message: nestedValue.message,
            stack: nestedValue.stack
          };
        }

        return nestedValue;
      },
      2
    );
  } catch {
    return String(value);
  }
}

export function writeDesktopSupportLog(level: string, ...values: unknown[]) {
  try {
    const supportLogPath = getDesktopSupportLogPath();

    if (
      existsSync(supportLogPath) &&
      statSync(supportLogPath).size >= maxSupportLogBytes
    ) {
      const archivedLogPath = `${supportLogPath}.1`;
      rmSync(archivedLogPath, { force: true });
      renameSync(supportLogPath, archivedLogPath);
    }

    const line = [
      new Date().toISOString(),
      level.toUpperCase(),
      values.map((value) => serializeSupportLogValue(value)).join(" ")
    ].join(" | ");
    appendFileSync(supportLogPath, `${line}\n`, "utf8");
  } catch {
    // Logging must never become the reason the desktop cannot start.
  }
}

function isBrokenPipeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "EPIPE";
}

export function installDesktopSupportLogging() {
  if (supportLoggingInstalled) {
    return;
  }

  supportLoggingInstalled = true;

  for (const method of ["log", "info", "warn", "error"] as const) {
    const original = console[method].bind(console) as (...args: unknown[]) => void;
    (console as Console & Record<typeof method, (...args: unknown[]) => void>)[method] = (
      ...args: unknown[]
    ) => {
      writeDesktopSupportLog(method, ...args);

      try {
        original(...args);
      } catch (error) {
        if (!isBrokenPipeError(error)) {
          writeDesktopSupportLog("error", "Console write failed.", error);
          throw error;
        }
      }
    };
  }

  process.on("uncaughtException", (error) => {
    writeDesktopSupportLog("fatal", "Uncaught main-process exception.", error);
  });

  process.on("unhandledRejection", (reason) => {
    writeDesktopSupportLog("fatal", "Unhandled main-process promise rejection.", reason);
  });

  app.on("child-process-gone", (_event, details) => {
    console.error("Store Desktop child process exited unexpectedly.", details);
  });
}
