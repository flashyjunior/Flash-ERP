import type { DesktopRuntimeApi } from "./desktop-runtime.js";

declare global {
  interface Window {
    desktopRuntime: DesktopRuntimeApi;
  }
}

export {};
