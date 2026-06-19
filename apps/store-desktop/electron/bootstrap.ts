import { app, dialog } from "electron";

import { installDesktopSupportLogging, writeDesktopSupportLog } from "./support-log.js";

installDesktopSupportLogging();

if (process.env.FLASH_ERP_DESKTOP_ENABLE_GPU !== "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  writeDesktopSupportLog(
    "info",
    "Flash ERP desktop hardware acceleration disabled for POS stability.",
  );
}

writeDesktopSupportLog("info", "Flash ERP desktop bootstrap starting.");

void import("./main.js").catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.stack ?? `${error.name}: ${error.message}`
      : String(error);

  writeDesktopSupportLog("fatal", "Desktop main module failed to load.", error);

  const showStartupError = () => {
    dialog.showErrorBox("Flash ERP Store Desktop failed to start", message);
  };

  if (app.isReady()) {
    showStartupError();
    return;
  }

  void app.whenReady().then(showStartupError);
});
