import React from "react";
import ReactDOM from "react-dom/client";

import { ModernDesktopApp } from "./modern-app";
import "./modern-styles.css";

type RendererDiagnosticRuntime = {
  writeDesktopDiagnostic?: (
    level: "info" | "warn" | "error",
    label: string,
    details?: Record<string, unknown> | null,
  ) => void;
};

function getDiagnosticRuntime() {
  return (window as Window & { desktopRuntime?: RendererDiagnosticRuntime })
    .desktopRuntime;
}

function writeRendererDiagnostic(
  level: "info" | "warn" | "error",
  label: string,
  details?: Record<string, unknown>,
) {
  if (level === "error") {
    console.error("[flash-erp-desktop]", label, details ?? {});
  } else if (level === "warn") {
    console.warn("[flash-erp-desktop]", label, details ?? {});
  } else {
    console.info("[flash-erp-desktop]", label, details ?? {});
  }
  getDiagnosticRuntime()?.writeDesktopDiagnostic?.(level, label, details ?? null);
}

window.addEventListener("error", (event) => {
  writeRendererDiagnostic("error", "renderer-window-error", {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  writeRendererDiagnostic("error", "renderer-unhandled-rejection", {
    reason:
      event.reason instanceof Error
        ? event.reason.message
        : String(event.reason ?? "unknown"),
  });
});

writeRendererDiagnostic("info", "renderer-entry-loaded");

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ModernDesktopApp />
    </React.StrictMode>,
  );
  writeRendererDiagnostic("info", "react-root-render-scheduled");
} catch (error) {
  writeRendererDiagnostic("error", "react-root-render-failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  throw error;
}
